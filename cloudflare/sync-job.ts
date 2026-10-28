// Resumable background sync driven by a cron trigger (and "立即同步"). Each tick advances within a time budget;
// progress is saved in D1 so a run can span many invocations.
import {providerRead,ProviderError,fatalProviderError} from '@/lib/tracker/provider';
import {syncBatch,upgradeBatch,listFolders} from '@/lib/tracker/sync';
import {getState,setState} from '@/lib/tracker/store';
import {OWNER} from './shims/chatgpt-auth';
import {isConnected} from './mcp';
import {reclassifyAll} from './reclassify';
import {inScanWindow} from './window';
type Auto={phase:'idle'|'ref'|'sync'|'upgrade';mode?:'full'|'recent';runId?:string;anchor?:string;page?:number;pages?:number;processed?:number;refPage?:number;lockUntil?:number;lastRun?:string;lastOk?:string;lastError?:string;nextRecentAt?:number;manual?:boolean;scopeStart?:string};
/** Creations before this Taipei date are history and are never back-filled; only newer work is synced. */
export const SYNC_START='2026-10-28';
const KEY='auto',BUDGET_MS=25000,RECENT_DAYS=3,INTERVAL_MS=10*60000;
const taipei=(d:Date)=>new Date(d.getTime()+8*3600000).toISOString().slice(0,10);
export const getAuto=async():Promise<Auto>=>({phase:'idle',...await getState(OWNER,KEY,{})});
const put=(a:Auto)=>setState(OWNER,KEY,a);
export async function requestRun(mode:'full'|'recent',manual=false){
  const a=await getAuto();if(a.phase!=='idle'&&(a.lockUntil||0)>Date.now())return {started:false,running:true};
  await put({...a,phase:'ref',mode,manual,scopeStart:SYNC_START,runId:crypto.randomUUID(),anchor:new Date().toISOString(),page:1,pages:undefined,processed:0,refPage:1,lockUntil:0,lastRun:new Date().toISOString(),lastError:undefined});return {started:true};
}
export async function tick(){
  if(!(await reclassifyAll(Date.now()+20000)))return;
  if(!(await isConnected()))return;
  let a=await getAuto();const now=Date.now();
  if((a.lockUntil||0)>now)return;
  if(!a.manual&&!inScanWindow(now))return;
  if(a.phase==='idle'){
    const first=!(await getState(OWNER,'sync',null));
    if(!first&&now<(a.nextRecentAt||0))return;
    await requestRun(first?'full':'recent');a=await getAuto();
  }
  if(a.phase!=='idle'&&a.scopeStart!==SYNC_START){await requestRun(a.mode||'full',!!a.manual);a=await getAuto()}
  await put({...a,lockUntil:now+BUDGET_MS+15000});
  const deadline=now+BUDGET_MS;
  try{
    if(a.phase==='ref'){
      if((a.refPage||1)===1){const data=await providerRead('account_balance');if(data.credits){const at=new Date().toISOString();await setState(OWNER,'balance',{...data,at});const snaps=await getState(OWNER,'snapshots',[]);snaps.push({at,...data.credits});await setState(OWNER,'snapshots',snaps.slice(-500))}}
      for(;;){const p=a.refPage||1;const d=await listFolders(OWNER,undefined,p);a.refPage=p+1;await put({...a,lockUntil:Date.now()+40000});if(!d.pagination||p>=d.pagination.lastPage){a.phase='sync';break}if(Date.now()>deadline)break}
    }
    if(a.phase==='sync'){
      const recentStart=taipei(new Date(Date.now()-(RECENT_DAYS-1)*864e5)),scope:any={start:a.mode==='recent'&&recentStart>SYNC_START?recentStart:SYNC_START};
      while(Date.now()<deadline){
        const page=a.page||1;
        const d=await syncBatch(OWNER,{...scope,page,anchor:a.anchor,runId:a.runId});
        a.pages=d.sync.pagination.lastPage;a.processed=d.sync.processed;a.page=page+1;await put({...a,lockUntil:Date.now()+40000});
        if(page>=d.sync.pagination.lastPage){a.phase='upgrade';break}
      }
    }
    if(a.phase==='upgrade'){
      while(Date.now()<deadline){const u=await upgradeBatch(OWNER);if(u.done||u.stalled){a.phase='idle';a.lastOk=new Date().toISOString();a.nextRecentAt=Date.now()+INTERVAL_MS;break}}
    }
  }catch(e:any){
    a.lastError=e instanceof ProviderError&&fatalProviderError(e)?e.message:String(e?.message||e).slice(0,300);console.error('[sync]',a.lastError);
    if(e instanceof ProviderError&&fatalProviderError(e)){a.phase='idle';a.nextRecentAt=Date.now()+INTERVAL_MS}
  }
  a.lockUntil=0;await put(a);
}
