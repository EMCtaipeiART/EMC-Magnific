import {providerRead,ProviderError,fatalProviderError} from '@/lib/tracker/provider';
import {syncBatch,upgradeBatch,listFolders} from '@/lib/tracker/sync';
import {getState,setState} from '@/lib/tracker/store';
import {OWNER} from './shims/chatgpt-auth';
import {isConnected} from './magnific-mcp';
const INTERVAL=Math.max(5,Number(process.env.SYNC_INTERVAL_MIN)||60)*60000,RECENT_DAYS=Math.max(1,Number(process.env.SYNC_RECENT_DAYS)||3);
const taipei=(d:Date)=>new Date(d.getTime()+8*3600000).toISOString().slice(0,10);
let running=false;const status:{running:boolean;mode?:string;lastRun?:string;lastOk?:string;lastError?:string;page?:number;pages?:number;processed?:number}={running:false};
export const schedulerStatus=()=>({...status});
async function refreshReference(){
  const data=await providerRead('account_balance');if(data.credits){const at=new Date().toISOString();await setState(OWNER,'balance',{...data,at});const snaps=await getState(OWNER,'snapshots',[]);snaps.push({at,...data.credits});await setState(OWNER,'snapshots',snaps.slice(-500))}
  for(let p=1;;p++){const d=await listFolders(OWNER,undefined,p);if(!d.pagination||p>=d.pagination.lastPage)break}
}
async function run(mode:'full'|'recent'){
  if(running||!isConnected())return;running=true;Object.assign(status,{running:true,mode,lastRun:new Date().toISOString(),lastError:undefined,page:0,pages:undefined,processed:0});
  try{
    await refreshReference();
    const scope:any=mode==='recent'?{start:taipei(new Date(Date.now()-(RECENT_DAYS-1)*864e5))}:{};
    const anchor=new Date().toISOString(),runId=crypto.randomUUID();
    for(let page=1;;page++){
      const d=await syncBatch(OWNER,{...scope,page,anchor,runId});status.page=page;status.pages=d.sync.pagination.lastPage;status.processed=d.sync.processed;
      if(page>=d.sync.pagination.lastPage)break;
    }
    for(let i=0;i<200;i++){const u=await upgradeBatch(OWNER);if(u.done||u.stalled)break}
    status.lastOk=new Date().toISOString();
  }catch(e:any){
    status.lastError=e instanceof ProviderError&&fatalProviderError(e)?e.message:String(e?.message||e).slice(0,300);console.error('[sync]',status.lastError);
  }finally{running=false;status.running=false}
}
export function syncNow(mode:'full'|'recent'){if(running||!isConnected())return {started:false,running,connected:isConnected()};void run(mode);return {started:true}}
export async function startScheduler(){
  const first=await getState(OWNER,'sync',null);
  setTimeout(()=>void run(first?'recent':'full'),5000);
  setInterval(()=>void run('recent'),INTERVAL);
}
