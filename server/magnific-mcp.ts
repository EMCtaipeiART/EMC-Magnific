// OAuth 2.0 (PKCE + dynamic client registration) client for https://mcp.magnific.com.
// Only read-only tools are allowed; tokens are stored in the data volume.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {UnauthorizedError} from '@modelcontextprotocol/sdk/client/auth.js';
import type {OAuthClientProvider} from '@modelcontextprotocol/sdk/client/auth.js';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
const MCP_URL=process.env.MAGNIFIC_MCP_URL||'https://mcp.magnific.com';
const AUTH_FILE=process.env.AUTH_PATH||'./data/magnific-auth.json';
export const PUBLIC_URL=()=>(process.env.PUBLIC_URL||'http://localhost:8080').replace(/\/$/,'');
export const READ_TOOLS=new Set(['account_balance','folders_list','folders_get','creations_search','creations_get','simulate_cost','images_models_list','video_models_list','video_modify_models_list']);
type Saved={clientInformation?:any;tokens?:any;codeVerifier?:string};
function load():Saved{try{return JSON.parse(readFileSync(AUTH_FILE,'utf8'))}catch{return {}}}
function save(v:Saved){mkdirSync(dirname(AUTH_FILE),{recursive:true});const tmp=AUTH_FILE+'.tmp';writeFileSync(tmp,JSON.stringify(v),{mode:0o600});renameSync(tmp,AUTH_FILE);try{chmodSync(AUTH_FILE,0o600)}catch{}}
let pendingAuthUrl:string|null=null;
const provider:OAuthClientProvider={
  get redirectUrl(){return PUBLIC_URL()+'/auth/callback'},
  get clientMetadata(){return {client_name:'EMC Magnific Ledger',redirect_uris:[PUBLIC_URL()+'/auth/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'}},
  clientInformation:()=>load().clientInformation,
  saveClientInformation:(c)=>save({...load(),clientInformation:c}),
  tokens:()=>load().tokens,
  saveTokens:(t)=>save({...load(),tokens:t}),
  saveCodeVerifier:(v)=>save({...load(),codeVerifier:v}),
  codeVerifier:()=>{const v=load().codeVerifier;if(!v)throw new Error('授權流程已逾時，請重新按「連接 Magnific」。');return v},
  redirectToAuthorization:(url)=>{pendingAuthUrl=url.toString()},
  invalidateCredentials:(scope)=>{const s=load();if(scope==='all')save({});else if(scope==='tokens')save({...s,tokens:undefined});else if(scope==='client')save({...s,clientInformation:undefined});else if(scope==='verifier')save({...s,codeVerifier:undefined})},
};
export const isConnected=()=>!!load().tokens;
export function disconnect(){save({clientInformation:load().clientInformation})}
function transport(){return new StreamableHTTPClientTransport(new URL(MCP_URL),{authProvider:provider})}
/** Begin the browser sign-in; returns the Magnific authorization URL. */
export async function startAuth():Promise<string>{
  pendingAuthUrl=null;
  const client=new Client({name:'emc-magnific-ledger',version:'1.0.0'});
  try{await client.connect(transport());await client.close();return PUBLIC_URL()+'/?connected=1'}
  catch(e){if(e instanceof UnauthorizedError&&pendingAuthUrl)return pendingAuthUrl;throw e}
}
export async function finishAuth(code:string){
  const t=transport();await t.finishAuth(code);
  const client=new Client({name:'emc-magnific-ledger',version:'1.0.0'});await client.connect(transport());await client.close();
}
let shared:Client|null=null;
async function connect(){
  if(shared)return shared;
  const client=new Client({name:'emc-magnific-ledger',version:'1.0.0'});
  try{await client.connect(transport())}catch(e){pendingAuthUrl=null;throw e}
  client.onclose=()=>{if(shared===client)shared=null};
  return shared=client;
}
export async function callTool(name:string,args:Record<string,unknown>){
  if(!READ_TOOLS.has(name))return {status:'tool_not_allowed',message:'此工具未開放。'};
  if(!isConnected())return {status:'reauthentication_required',message:'尚未連接 Magnific，請由管理員按「連接 Magnific」。'};
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
