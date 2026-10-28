import {getChatGPTUser,chatGPTSignInPath} from '@/app/chatgpt-auth';
import {queryLedger,getState,setState,getRecords,saveRecords,db,parseFilters,whereFor,exportRecords} from '@/lib/tracker/store';
import {syncBatch,upgradeBatch,repriceBatch,listFolders,priceRecord} from '@/lib/tracker/sync';
import {providerRead,ProviderError} from '@/lib/tracker/provider';
import {DEFAULT_SETTINGS} from '@/lib/tracker/types';
import type {CostRule,LedgerRecord,TrackerSettings} from '@/lib/tracker/types';
import {tidy,finite,folderLineage} from '@/lib/tracker/domain';
export const dynamic='force-dynamic';
const reply=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function audit(owner:string,entry:any){const list=await getState(owner,'audit',[]);list.unshift({at:new Date().toISOString(),...entry});await setState(owner,'audit',list.slice(0,1000))}
function returnPath(req:Request){try{const u=new URL(req.headers.get('referer')||req.url);return u.origin===new URL(req.url).origin&&!u.pathname.startsWith('/api/')?u.pathname+u.search:'/'}catch{return '/'}}
function failure(e:any,req?:Request){if(e instanceof ProviderError)return reply({error:e.message,connector:{...e.detail,...(req?{chatGPTSignInPath:chatGPTSignInPath(returnPath(req))}:{})}},502);return reply({error:e instanceof Error?e.message:'處理失敗，請稍後重試。'},400)}
function validDay(value:string){return !value||/^\d{4}-\d{2}-\d{2}$/.test(value)}
export async function GET(req:Request){
 const user=await getChatGPTUser();if(!user)return reply({error:'登入後才能讀取你的用量明細。',signIn:chatGPTSignInPath(returnPath(req))},401);
 try{const p=new URL(req.url).searchParams;
  if(p.get('record')){const record=(await getRecords(user.userId,[p.get('record')!.slice(0,100)]))[0];if(!record)return reply({error:'找不到作品。'},404);const history=(await getState(user.userId,'audit',[])).filter((x:any)=>x.recordId===record.id).slice(0,20);return reply({record,history})}
  return reply(await queryLedger(user.userId,p));
 }catch(e){return failure(e,req)}
}
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'請從此網站提交操作。'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'請先登入 ChatGPT。',signIn:chatGPTSignInPath(returnPath(req))},401);
 const owner=user.userId;
 try{
  const text=await req.text();if(text.length>100000)return reply({error:'一次提交的資料過大。'},413);const b=JSON.parse(text);
  if(b.op==='balance'){const data=await providerRead('account_balance');if(!data.credits)throw new Error('Magnific 沒有回傳點數餘額。');const now=new Date().toISOString(),balance={...data,at:now};await setState(owner,'balance',balance);const snapshots=await getState(owner,'snapshots',[]);snapshots.push({at:now,...data.credits});await setState(owner,'snapshots',snapshots.slice(-500));return reply({balance})}
  if(b.op==='folders')return reply(await listFolders(owner,tidy(b.parent,100)||undefined,Math.max(1,Math.min(10000,Number(b.page)||1))));
  if(b.op==='sync')return reply(await syncBatch(owner,b));
  if(b.op==='upgrade')return reply(await upgradeBatch(owner));
  if(b.op==='reprice')return reply(await repriceBatch(owner,b));
  if(b.op==='export'){const params=new URLSearchParams();for(const [k,v] of Object.entries(b.filters||{}))if(typeof v==='string')params.set(k,v);return reply(await exportRecords(owner,parseFilters(params),tidy(b.cursor,100)))}
  if(b.op==='edit'){
   const r=(await getRecords(owner,[tidy(b.id,100)]))[0];if(!r)return reply({error:'找不到作品。'},404);const before={person:r.person,costProject:r.costProject,credits:r.credits,creditSource:r.creditSource,note:r.note,workSummary:r.workSummary};
   if(typeof b.person==='string'&&b.person.trim()&&b.person.trim()!==r.person){r.person=tidy(b.person,100);r.personSource='manual'}
   if(typeof b.costProject==='string'&&b.costProject.trim()&&b.costProject.trim()!==r.costProject){r.costProject=tidy(b.costProject,200);r.costProjectSource='manual'}
   if(b.resetAttribution){const folders=await getState(owner,'folders',[]),settings=await getState(owner,'settings',DEFAULT_SETTINGS),lineage=folderLineage(r.folder,r.project,folders);const person=settings.projectPeople?.[r.project]||lineage.root?.name||'';r.person=person&&!/^personal( project)?$/i.test(person)?person:r.author||'未指定';r.personSource=person&&!/^personal( project)?$/i.test(person)?'personal-project':r.author?'author':'unknown';r.costProject=lineage.business?.name||'未分類工作專案';r.costProjectSource=lineage.business?'folder':'unassigned'}
   r.note=tidy(b.note,2000);r.workSummary=tidy(b.workSummary,2000);
   if(b.creditMode&&r.creditSource!=='provider'){
    if(b.creditMode==='automatic'){r.credits=null;r.creditSource='unknown';const rules=await getState(owner,'rules',[]);Object.assign(r,await priceRecord(owner,r,rules,new Map(),false))}
    else if(['manual','estimate'].includes(b.creditMode)){const points=finite(b.credits);if(points===null||points>1e9)throw new Error('請填寫有效的使用點數。');if(!r.note)throw new Error('人工點數請留下查核或估算依據。');r.credits=points;r.creditSource=b.creditMode}
   }
   r.changedAt=new Date().toISOString();await saveRecords(owner,[r]);await audit(owner,{type:'record-edit',recordId:r.id,before,after:{person:r.person,costProject:r.costProject,credits:r.credits,creditSource:r.creditSource,note:r.note,workSummary:r.workSummary}});return reply({record:r});
  }
  if(b.op==='assign'){
   const params=new URLSearchParams();for(const [k,v] of Object.entries(b.filters||{}))if(typeof v==='string')params.set(k,v);const f=parseFilters(params),w=whereFor(owner,f),person=tidy(b.person,100),project=tidy(b.costProject,200);if(!person&&!project)throw new Error('請填寫人員或工作專案。');
   const changes:string[]=[],values:any[]=[];if(person){changes.push("'$.person',?,'$.personSource','manual'");values.push(person)}if(project){changes.push("'$.costProject',?,'$.costProjectSource','manual'");values.push(project)}changes.push("'$.changedAt',?");values.push(new Date().toISOString());
   const result=await db().prepare(`UPDATE records SET data=json_set(data,${changes.join(',')}) WHERE ${w.sql}`).bind(...values,...w.args).run();await audit(owner,{type:'bulk-assignment',filters:f,person,costProject:project,changed:result.meta.changes});return reply({changed:result.meta.changes});
  }
  if(b.op==='settings'){
   const old:TrackerSettings={...DEFAULT_SETTINGS,...await getState(owner,'settings',{})};const cost=b.costPer1000===null||b.costPer1000===''?null:finite(b.costPer1000);if(cost!==null&&cost>1e9)throw new Error('成本換算金額不正確。');if(b.costPer1000!==null&&b.costPer1000!==''&&cost===null)throw new Error('請輸入有效成本。');
   const currency=tidy(b.currency,8).toUpperCase();if(!['TWD','USD','JPY','HKD','EUR','CNY'].includes(currency))throw new Error('請選擇支援的幣別。');
   const projectPeople={...old.projectPeople};const folders=await getState(owner,'folders',[]);if(b.projectPeople&&typeof b.projectPeople==='object'){for(const f of folders.filter((f:any)=>f.type==='project'||f.type==='project_default')){if(Object.hasOwn(b.projectPeople,f.reference))projectPeople[f.reference]=tidy(b.projectPeople[f.reference],100)}}
   const settings={currency,costPer1000:cost,projectPeople};await setState(owner,'settings',settings);
   for(const [ref,label] of Object.entries(projectPeople)){if(old.projectPeople[ref]===label)continue;const fallback=folders.find((f:any)=>f.reference===ref)?.name||'';const person=label||fallback;await db().prepare("UPDATE records SET data=json_set(data,'$.person',?,'$.personSource','personal-project') WHERE owner=? AND json_extract(data,'$.project')=? AND COALESCE(json_extract(data,'$.personSource'),'')<>'manual'").bind(person,owner,ref).run()}
   await audit(owner,{type:'settings',before:old,after:settings});return reply({settings});
  }
  if(b.op==='saveRule'){
   const rules:CostRule[]=await getState(owner,'rules',[]),input=b.rule||{};const rate=finite(input.rate),duration=input.duration===null||input.duration===''?null:finite(input.duration);
   if(rate===null||rate>1e9||!tidy(input.label,100)||!tidy(input.tool,100)||!tidy(input.modelSlug,160))throw new Error('費率名稱、操作、模型型號及每單位點數為必填。');
   if(!['creation','second'].includes(input.unit)||!['any','on','off'].includes(input.sound))throw new Error('費率單位或音效條件無效。');const start=tidy(input.start,10),end=tidy(input.end,10);if(!validDay(start)||!validDay(end)||(start&&end&&start>end))throw new Error('費率適用日期無效。');if(!tidy(input.note,1000))throw new Error('請記錄費率依據，例如官方價目或帳單查核。');
   const id=tidy(input.id,100)||crypto.randomUUID(),previous=rules.find(x=>x.id===id);const rule:CostRule={id,label:tidy(input.label,100),tool:tidy(input.tool,100),modelSlug:tidy(input.modelSlug,160),resolution:tidy(input.resolution,50),quality:tidy(input.quality,50),variant:tidy(input.variant,80),sound:input.sound,duration,start,end,unit:input.unit,rate,note:tidy(input.note,1000),enabled:input.enabled!==false,updatedAt:new Date().toISOString()};const index=rules.findIndex(x=>x.id===id);if(index<0&&rules.length>=200)throw new Error('目前最多保留 200 條費率規則。');if(index<0)rules.unshift(rule);else rules[index]=rule;await setState(owner,'rules',rules);await audit(owner,{type:'rate-rule',before:previous||null,after:rule});return reply({rules});
  }
  return reply({error:'不支援的操作。'},400);
 }catch(e){return failure(e,req)}
}
