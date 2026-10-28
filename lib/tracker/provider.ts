import {decode} from '@toon-format/toon';
import {imageSize} from 'image-size';
import {connectorsForRequest} from '@/lib/connectors';
import {chatGPTSignInPath} from '@/app/chatgpt-auth';
const CONNECTOR='asdk_app_6a1f227d5a848191ae3317c66947b440';
export class ProviderError extends Error {
  constructor(message:string,public detail:Record<string,unknown>={}){super(message)}
}
export function parseProvider(result:any):any{
  if(result.structuredContent!==null&&result.structuredContent!==undefined){
    const v=result.structuredContent;
    if(v.error_code||v.error)throw new ProviderError(typeof v.error==='string'?v.error:'Magnific 回傳錯誤，請確認模型與參數。',{status:'tool_error',providerCode:v.error_code});
    return v;
  }
  const text=result.content?.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n')||'';
  let value;try{value=JSON.parse(text)}catch{try{value=decode(text)}catch{throw new ProviderError('Magnific 回傳的資料格式無法辨識。',{status:'upstream_error'})}}
  if(!value||typeof value!=='object')throw new ProviderError('Magnific 沒有回傳可用資料。',{status:'upstream_error'});
  return value;
}
export async function providerRead(action:'account_balance'|'folders_list'|'folders_get'|'creations_search'|'creations_get'|'simulate_cost'|'images_models_list'|'video_models_list'|'video_modify_models_list',args:Record<string,any>={}){
  const response=await connectorsForRequest().invoke(CONNECTOR,action,args);
  if(response.status!=='success')throw new ProviderError(response.message||'Magnific 連線無法使用。',{...response,chatGPTSignInPath:chatGPTSignInPath('/')});
  return parseProvider(response.result);
}
export function fatalProviderError(e:unknown){return e instanceof ProviderError&&['reauthentication_required','connector_access_disabled','rate_limited','binding_unavailable','tool_not_allowed','request_context_expired'].includes(String(e.detail.status))}
export async function verifyDimensions(url:string):Promise<{width:number;height:number}|null>{
  // Only asset URLs obtained in the authenticated provider response reach this function.
  let u:URL;try{u=new URL(url)}catch{return null}
  if(u.protocol!=='https:'||!(/(^|\.)cdnpk\.net$/.test(u.hostname)))return null;
  let response:Response|undefined;
  try{
    response=await fetch(u.toString(),{headers:{Range:'bytes=0-262143'},redirect:'manual',signal:AbortSignal.timeout(9000)});
    if(!response.ok||!response.body){console.warn('Asset header unavailable:',response.status);return null;}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{while(size<262144){const next=await reader.read();if(next.done)break;chunks.push(next.value);size+=next.value.length;
      const bytes=new Uint8Array(size);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length}
      try{const d=imageSize(bytes);if(d.width&&d.height)return {width:d.width,height:d.height}}catch{}
    }}finally{await reader.cancel().catch(()=>{})}
  }catch(error){console.warn('Asset dimension check failed:',error instanceof Error?error.message:String(error))}
  return null;
}
