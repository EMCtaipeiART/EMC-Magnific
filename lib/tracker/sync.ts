import type {LedgerRecord,FolderInfo,TrackerSettings,CostRule,PriceQuote} from './types';
import {DEFAULT_SETTINGS} from './types';
import {normalize,priceRequest,applyQuote,matchRule,ruleQuote,isUpload,UPLOAD_TOOLS,DATA_VERSION,tidy,finite} from './domain';
import {providerRead,fatalProviderError,ProviderError,verifyDimensions} from './provider';
import {db,getState,setState,getRecords,saveRecords} from './store';
const BATCH=20;
async function catalog(owner:string){
 const cache=await getState(owner,'catalog');if(cache&&Date.now()-Date.parse(cache.at)<86400000)return new Map<string,any>(cache.models.map((m:any)=>[m.slug,m]));
 const results=await Promise.allSettled([providerRead('images_models_list'),providerRead('video_models_list'),providerRead('video_modify_models_list')]);const map=new Map<string,any>();
 for(const r of results){if(r.status==='rejected'){if(fatalProviderError(r.reason))throw r.reason;continue}for(const m of r.value.models||[]){if(m.slug)map.set(m.slug,{slug:m.slug,name:m.name,api:m.api,mode:m.mode,supportsSoundEffects:m.supportsSoundEffects||m.soundEffects?.allowed})}}
 if(map.size)await setState(owner,'catalog',{at:new Date().toISOString(),models:[...map.values()]});return map;
}
function folderItem(data:any,parent?:string):FolderInfo|null{if(!data.reference||!data.name)return null;return {reference:data.reference,name:data.name,type:data.type||'folder',parentReference:parent||String(data.parent?.id||'')||null,projectReference:data.projectReference}}
export async function listFolders(owner:string,parent?:string,page=1){
 const result=await providerRead('folders_list',parent?{parentReference:parent,page}:{onlyProjects:true,page});if(!Array.isArray(result.items))throw new Error('Magnific 沒有回傳資料夾清單。');const saved:FolderInfo[]=await getState(owner,'folders',[]),map=new Map(saved.map(f=>[f.reference,f]));
 for(const data of result.items){const f=folderItem(data,parent);if(f)map.set(f.reference,f)}await setState(owner,'folders',[...map.values()]);return {items:[...map.values()],pagination:result.pagination||null};
}
async function resolveFolders(owner:string,raws:any[],warnings:string[]):Promise<FolderInfo[]>{
 let saved:FolderInfo[]=await getState(owner,'folders',[]);if(!saved.some(f=>f.type==='project'||f.type==='project_default')){const result=await listFolders(owner);saved=result.items}
 const map=new Map(saved.map(f=>[f.reference,f]));let remaining=36;
 for(const r of raws){for(const ref of [r.projectReference,r.folderReference]){let id=ref,depth=0;const seen=new Set<string>();while(id&&!seen.has(id)&&depth++<10){seen.add(id);const current=map.get(id);if(current){if(current.type==='project'||current.type==='project_default')break;id=current.parentReference;continue}if(remaining--<=0){warnings.push('部分資料夾名稱尚未解析，稍後可按「補齊既有紀錄」重試。');break}
 try{const d=await providerRead('folders_get',{reference:id}),f=folderItem(d);if(!f)break;map.set(f.reference,f);if(d.parent?.id&&String(d.parent.id)===r.projectReference&&!map.has(String(d.parent.id))){map.set(String(d.parent.id),{reference:String(d.parent.id),name:d.parent.name||'未命名個人專案',type:'project'})}id=f.parentReference}catch(e){if(fatalProviderError(e))throw e;warnings.push('有資料夾名稱無法讀取，該筆會保留原始歸屬待查。');break}
 }}}
 const folders=[...map.values()];await setState(owner,'folders',folders);return folders;
}
async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('')}
export async function priceRecord(owner:string,record:LedgerRecord,rules:CostRule[],pending:Map<string,Promise<PriceQuote>>,force=false){
 if(['provider','manual','estimate','free'].includes(record.creditSource))return record;
 const now=new Date().toISOString(),custom=matchRule(record,rules);if(custom)return applyQuote(record,ruleQuote(record,custom,now));
 const request=priceRequest(record);if(request.problem)return applyQuote(record,null,request.problem);
 if(!force&&record.quote?.key===request.key&&record.quote.certainty==='exact'&&!record.quote.ruleId)return applyQuote(record,record.quote);
 if(!pending.has(request.key))pending.set(request.key,(async()=>{
 const cacheKey='quote:'+await digest(request.key),cached=await getState(owner,cacheKey);
 if(!force&&cached&&cached.key===request.key&&Date.now()-Date.parse(cached.at)<86400000)return cached as PriceQuote;
 const data=await providerRead('simulate_cost',{tool:request.tool,arguments:request.args});
 if(!['exact','variable','unsupported'].includes(data.certainty))throw new Error('官方試算未回傳有效費率，可能是型號已停用或規格不完整。');
 const quote:PriceQuote={key:request.key,tool:request.tool,args:request.args,at:now,certainty:data.certainty,credits:finite(data.credits),range:data.range?{min:finite(data.range.min)??undefined,max:finite(data.range.max)??undefined}:undefined,isUnlimited:!!data.isUnlimited,reason:tidy(data.reason,1000),formula:request.formula};
 if(data.certainty==='exact'&&quote.credits===null)throw new Error('官方試算缺少點數數值。');
 await setState(owner,cacheKey,quote);return quote;
 })());
 try{return applyQuote(record,await pending.get(request.key)!)}catch(e){if(fatalProviderError(e))throw e;return applyQuote(record,null,e instanceof Error?e.message:'此筆官方費率暫時無法查核。')}
}
async function enrich(owner:string,raws:any[],leanRows:any[],force=false){
 const warnings:string[]=[],[folders,settings,rules,models]=await Promise.all([resolveFolders(owner,raws,warnings),getState(owner,'settings',DEFAULT_SETTINGS),getState(owner,'rules',[]),catalog(owner)]);
 const oldRecords=await getRecords(owner,raws.map(r=>r.identifier)),old=new Map(oldRecords.map(r=>[r.id,r])),leans=new Map(leanRows.map(r=>[r.identifier,r])),quotes=new Map<string,Promise<PriceQuote>>(),out:LedgerRecord[]=[];
 // Limit concurrent pricing and header reads to avoid a large fan-out on shared accounts.
 for(let i=0;i<raws.length;i+=4){const group=await Promise.all(raws.slice(i,i+4).filter(r=>r.identifier&&!isUpload(r.tool)).map(async raw=>{
   let r=normalize(raw,leans.get(raw.identifier),old.get(raw.identifier),folders,{...DEFAULT_SETTINGS,...settings},models,new Date().toISOString());
   if(r.kind==='image'&&(force||r.dimensionsSource!=='file')){const dimensions=await verifyDimensions(raw.url||'');if(dimensions){r={...r,...dimensions,dimensionsSource:'file'};if(r.reportedWidth!==r.width||r.reportedHeight!==r.height)r.spec.dimensionsNote='平台記錄尺寸與輸出檔案不同；此處已採檔案實測值。'}}
   r=await priceRecord(owner,r,rules,quotes,force);return r;
 }));out.push(...group)}
 await saveRecords(owner,out);
 return {records:out,warnings:[...new Set(warnings)],pricing:{calculated:out.filter(r=>['calculated','rule','provider','manual','free'].includes(r.creditSource)).length,range:out.filter(r=>r.creditSource==='range').length,unknown:out.filter(r=>r.creditSource==='unknown').length}};
}
export async function syncBatch(owner:string,b:any){
 const page=Math.max(1,Math.min(10000,Number(b.page)||1)),start=tidy(b.start,10),end=tidy(b.end,10),anchor=tidy(b.anchor,40)||new Date().toISOString();
 for(const d of [start,end])if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error('同步日期格式不正確。');if(start&&end&&start>end)throw new Error('開始日期不能晚於結束日期。');
 if(!Number.isFinite(Date.parse(anchor))||Date.parse(anchor)>Date.now()+60000)throw new Error('同步快照時間無效。');
 const project=tidy(b.project,100),folder=tidy(b.folder,100);
 const runId=tidy(b.runId,100)||crypto.randomUUID();const history=await getState(owner,'syncLog',[]);const previous=history.find((entry:any)=>entry.runId===runId);if(page>1&&!previous&&!b.serverRun)throw new Error('找不到上一批同步進度，請從第一批重新開始。');if(previous){if(page>previous.pagination.currentPage+1)throw new Error('同步批次不連續，請從已保存的下一批繼續。');for(const [key,value] of Object.entries({start,end,project,folder,anchor}))if(previous[key]!==value)throw new Error('同步範圍與已保存進度不同，請開始新的同步。');}
 const args:any={from:folder?'folder':project?'project-root':'history',perPage:BATCH,page,full:false,orderBy:'created_at',orderDirection:'desc',excludeToolNames:UPLOAD_TOOLS};
 if(folder||project){args.reference=folder||project;args.includeSubfolders=true}
 if(start)args.dateStart=start+'T00:00:00+08:00';const endIso=end?new Date(end+'T23:59:59+08:00').toISOString():anchor;args.dateEnd=Date.parse(endIso)<Date.parse(anchor)?endIso:anchor;
 const data=await providerRead('creations_search',args);if(!Array.isArray(data.items))throw new Error('Magnific 作品搜尋回應格式不正確。');
 const ids=data.items.filter((r:any)=>!isUpload(r.tool)).map((r:any)=>r.identifier);
 let raws:any[]=[];if(ids.length){const full=await providerRead('creations_get',{identifiers:ids});raws=full.creations||full.items||[];if(!Array.isArray(raws))throw new Error('Magnific 作品詳細資料格式不正確。')}
 const result=await enrich(owner,raws,data.items,!!b.force);
 if(raws.length<ids.length)result.warnings.push('部分作品詳細資料無法存取，該批不能視為完整。');
 const at=new Date().toISOString(),pagination=data.pagination||{currentPage:page,lastPage:page,perPage:BATCH,total:data.items.length};
 const scope={start,end,project,folder,anchor};
 const same=!!previous,add=same&&page<=previous.pagination.currentPage?false:true;
 const progress={version:DATA_VERSION,at,pagination,...scope,runId,count:result.records.length,processed:(same?previous.processed||0:0)+(add?result.records.length:0),priced:(same?previous.priced||0:0)+(add?result.pricing.calculated:0),range:(same?previous.range||0:0)+(add?result.pricing.range:0),unknown:(same?previous.unknown||0:0)+(add?result.pricing.unknown:0),complete:page>=pagination.lastPage&&raws.length===ids.length,warnings:result.warnings};
 await setState(owner,'sync',progress);const index=history.findIndex((x:any)=>x.runId===runId);if(index>=0)history[index]=progress;else history.unshift(progress);await setState(owner,'syncLog',history.slice(0,40));
 return {sync:progress,pricing:result.pricing,warnings:result.warnings,anchor,runId};
}
export async function upgradeBatch(owner:string){
 const rows=await db().prepare("SELECT id FROM records WHERE owner=? AND COALESCE(json_extract(data,'$.tool'),'') NOT LIKE '%upload%' AND COALESCE(json_extract(data,'$.version'),0)<? ORDER BY id LIMIT ?").bind(owner,DATA_VERSION,BATCH).all();
 const ids=rows.results.map((r:any)=>String(r.id));if(!ids.length)return {done:true,count:0,remaining:0};
 const data=await providerRead('creations_get',{identifiers:ids}),raws=data.creations||data.items||[];
 const result=await enrich(owner,raws,[],false);
 // Unavailable records retain their old data and are reported, never silently dropped.
 const count=await db().prepare("SELECT COUNT(*) AS n FROM records WHERE owner=? AND COALESCE(json_extract(data,'$.tool'),'') NOT LIKE '%upload%' AND COALESCE(json_extract(data,'$.version'),0)<?").bind(owner,DATA_VERSION).first<any>();
 return {count:result.records.length,remaining:count?.n||0,done:!count?.n,stalled:result.records.length===0,warnings:result.warnings,pricing:result.pricing};
}
// Records moved into a client folder after they were synced keep their old (unassigned) attribution; re-read them so the folder shows up.
export async function refreshUnassignedBatch(owner:string,cursor=''){
 const rows=await db().prepare("SELECT id FROM records WHERE owner=? AND id>? AND g_costProjectSource='unassigned' ORDER BY id LIMIT ?").bind(owner,cursor,BATCH).all();
 const ids=rows.results.map((r:any)=>String(r.id));if(!ids.length)return {done:true,cursor:'',count:0};
 const data=await providerRead('creations_get',{identifiers:ids}),raws=data.creations||data.items||[];
 const hit=raws.find((r:any)=>r.identifier==='p8qS6XNehw');if(hit){const {metadata,...rest}=hit;await setState(owner,'debug',{at:new Date().toISOString(),rest});}
 const result=await enrich(owner,raws,[],false);
 return {done:ids.length<BATCH,cursor:ids.at(-1)!,count:result.records.length};
}
export async function repriceBatch(owner:string,b:any){
 const cursor=tidy(b.cursor,100),rules:CostRule[]=await getState(owner,'rules',[]),pending=new Map<string,Promise<PriceQuote>>();
 const rows=await db().prepare('SELECT data FROM records WHERE owner=? AND id>? ORDER BY id LIMIT ?').bind(owner,cursor,BATCH).all();
 const records:LedgerRecord[]=rows.results.map((r:any)=>JSON.parse(r.data));const out:LedgerRecord[]=[];
 for(let i=0;i<records.length;i+=4)out.push(...await Promise.all(records.slice(i,i+4).map(async r=>r.version>=DATA_VERSION&&!isUpload(r.tool)?priceRecord(owner,r,rules,pending,!!b.force):r)));
 await saveRecords(owner,out);return {count:out.length,cursor:records.length===BATCH?records.at(-1)!.id:null,calculated:out.filter(r=>['calculated','rule'].includes(r.creditSource)).length,unpriced:out.filter(r=>['unknown','range'].includes(r.creditSource)).length};
}
