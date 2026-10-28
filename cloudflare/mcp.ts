// OAuth 2.0 (PKCE + dynamic client registration) client for https://mcp.magnific.com.
// Tokens live in D1 (state table); only read-only tools are allowed.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import type {OAuthClientProvider} from '@modelcontextprotocol/sdk/client/auth.js';
import {getState,setState} from '@/lib/tracker/store';
import {OWNER} from './shims/chatgpt-auth';
const MCP_URL='https://mcp.magnific.com';
export const READ_TOOLS=new Set(['account_balance','folders_list','folders_get','creations_search','creations_get','simulate_cost','images_models_list','video_models_list','video_modify_models_list']);
type Saved={origin?:string;clientInformation?:any;tokens?:any;codeVerifier?:string};
let cache:Saved|null=null,pendingAuthUrl:string|null=null;
async function load():Promise<Saved>{return cache??=await getState(OWNER,'oauth',{})}
async function save(patch:Partial<Saved>){cache={...await load(),...patch};await setState(OWNER,'oauth',cache)}
/** Must be called once per invocation: loads saved tokens and remembers the public origin. */
export async function initAuth(origin?:string){cache=null;const s=await load();if(origin&&s.origin!==origin)await save({origin})}
export async function isConnected(){return !!(await load()).tokens}
export async function disconnect(){const s=await load();cache={origin:s.origin,clientInformation:s.clientInformation};await setState(OWNER,'oauth',cache);shared=null}
function makeProvider():OAuthClientProvider{
  const redirect=(cache?.origin||'')+'/auth/callback';
  return {
    redirectUrl:redirect,
    clientMetadata:{client_name:'EMC Magnific Ledger',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},
    clientInformation:async()=>(await load()).clientInformation,
    saveClientInformation:async c=>{await save({clientInformation:c})},
    tokens:async()=>(await load()).tokens,
    saveTokens:async t=>{await save({tokens:t})},
    saveCodeVerifier:async v=>{await save({codeVerifier:v})},
    codeVerifier:async()=>{const v=(await load()).codeVerifier;if(!v)throw new Error('授權流程已逾時，請重新按「連接 Magnific」。');return v},
    redirectToAuthorization:url=>{pendingAuthUrl=url.toString()},
    invalidateCredentials:async scope=>{const s=await load();if(scope==='all')await save({tokens:undefined,clientInformation:undefined,codeVerifier:undefined});else if(scope==='tokens')await save({tokens:undefined});else if(scope==='client')await save({clientInformation:undefined});else if(scope==='verifier')await save({codeVerifier:undefined});void s},
  };
}
const transport=()=>new StreamableHTTPClientTransport(new URL(MCP_URL),{authProvider:makeProvider()});
const newClient=()=>new Client({name:'emc-magnific-ledger',version:'1.0.0'});
export async function startAuth():Promise<string>{
  pendingAuthUrl=null;const client=newClient();
  try{await client.connect(transport());await client.close();return (cache?.origin||'')+'/?connected=1'}
  catch(e){if(e instanceof UnauthorizedError&&pendingAuthUrl)return pendingAuthUrl;throw e}
}
export async function finishAuth(code:string){
  await transport().finishAuth(code);shared=null;
  const client=newClient();await client.connect(transport());await client.close();
}
let shared:Client|null=null;
async function connect(){if(shared)return shared;const client=newClient();await client.connect(transport());client.onclose=()=>{if(shared===client)shared=null};return shared=client}
export async function callTool(name:string,args:Record<string,unknown>){
  if(!READ_TOOLS.has(name))return {status:'tool_not_allowed',message:'此工具未開放。'};
  if(!(await isConnected()))return {status:'reauthentication_required',message:'尚未連接 Magnific，請由管理員按「連接 Magnific」。'};
  for(let attempt=0;attempt<2;attempt++){
    try{
      const client=await connect();
      const result=await client.callTool({name,arguments:args as any},undefined,{timeout:60000});
      if((result as any).isError){const text=((result as any).content||[]).map((c:any)=>c.text||'').join(' ').slice(0,300);return {status:'tool_error',message:text||'Magnific 回報錯誤。'}}
      return {status:'success',result};
    }catch(e:any){
      shared=null;
      if(e instanceof UnauthorizedError||/401|unauthori[sz]ed/i.test(String(e?.message)))return {status:'reauthentication_required',message:'Magnific 授權已失效，請管理員重新連接。'};
      if(attempt===1)return {status:'upstream_error',message:'Magnific 連線失敗：'+String(e?.message||e).slice(0,200)};
    }
  }
  return {status:'upstream_error',message:'Magnific 連線失敗。'};
}
