import {env} from 'cloudflare:workers';
import type {FilterValues,LedgerRecord} from './types';
import {EMPTY_FILTERS,DEFAULT_SETTINGS} from './types';
export const db=()=>env.DB;
export async function getState(owner:string,key:string,fallback:any=null){const r:any=await db().prepare('SELECT data FROM state WHERE owner=? AND key=?').bind(owner,key).first();if(!r)return fallback;try{return JSON.parse(r.data)}catch{return fallback}}
export async function setState(owner:string,key:string,data:any){await db().prepare('INSERT INTO state(owner,key,data) VALUES(?,?,?) ON CONFLICT(owner,key) DO UPDATE SET data=excluded.data').bind(owner,key,JSON.stringify(data)).run()}
export async function getRecords(owner:string,ids:string[]):Promise<LedgerRecord[]>{if(!ids.length)return [];const r=await db().prepare(`SELECT data FROM records INDEXED BY idx_records_fast WHERE owner=? AND id IN (${ids.map(()=>'?').join(',')})`).bind(owner,...ids).all();return r.results.map((r:any)=>JSON.parse(r.data))}
export async function saveRecords(owner:string,records:LedgerRecord[]){if(!records.length)return;const statements=records.map(r=>db().prepare('INSERT INTO records(owner,id,data) VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET data=excluded.data').bind(owner,r.id,JSON.stringify(r)));for(let i=0;i<statements.length;i+=40)await db().batch(statements.slice(i,i+40))}
// Hot fields are generated columns (see drizzle/0001_fast_columns.sql) covered by one index; the rest stay JSON.
const COLUMNS:Record<string,string>={tool:'g_tool',duration:'g_duration',credits:'g_credits',createdAt:'g_createdAt',model:'g_model',version:'g_version',status:'g_status',resolution:'g_resolution','quote.range.min':'g_quote_min','quote.range.max':'g_quote_max',project:'g_project',person:'g_person',modelSlug:'g_modelSlug',modelName:'g_modelName',kind:'g_kind',day:'g_day',creditSource:'g_creditSource',costProjectSource:'g_costProjectSource',costProject:'g_costProject',author:'g_author',actualDuration:'g_actualDuration',folder:'g_folder'};
const j=(name:string)=>COLUMNS[name]||`json_extract(data, '$.${name}')`;
export const fields={
 day:`COALESCE(${j('day')}, date(${j('createdAt')}, '+8 hours'))`,
 person:`COALESCE(NULLIF(${j('person')}, ''), '未指定')`,
 costProject:`COALESCE(NULLIF(${j('costProject')}, ''), '未分類工作專案')`,
 model:`COALESCE(NULLIF(${j('modelSlug')}, ''), ${j('model')}, '未記錄型號')`,
 modelName:`COALESCE(NULLIF(${j('modelName')}, ''), ${j('model')}, '未記錄型號')`,
 author:`COALESCE(NULLIF(${j('author')}, ''), '平台未提供')`,
 project:`COALESCE(${j('project')}, '')`,
 kind:`COALESCE(${j('kind')}, 'image')`,
 source:`COALESCE(${j('creditSource')}, 'unknown')`,
 resolution:`COALESCE(${j('resolution')}, '')`,
 status:`COALESCE(${j('status')}, 'unknown')`,
 credits:`CAST(COALESCE(${j('credits')}, 0) AS REAL)`,
 duration:`CAST(COALESCE(${j('duration')}, 0) AS REAL)`,
};
export function parseFilters(params:URLSearchParams):FilterValues{
 const out={...EMPTY_FILTERS};for(const key of Object.keys(out) as (keyof FilterValues)[]){const value=params.get(key);if(value!==null)out[key]=value.slice(0,key==='search'?300:200)}
 for(const key of ['start','end'] as const)if(out[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(out[key]))throw new Error('日期格式不正確。');
 if(out.start&&out.end&&out.start>out.end)throw new Error('開始日期不能晚於結束日期。');
 for(const key of ['minSeconds','maxSeconds'] as const)if(out[key]&&(!Number.isFinite(Number(out[key]))||Number(out[key])<0||Number(out[key])>100000))throw new Error('秒數範圍不正確。');
 if(out.minSeconds&&out.maxSeconds&&Number(out.minSeconds)>Number(out.maxSeconds))throw new Error('最小秒數不能大於最大秒數。');
 return out;
}
export function whereFor(owner:string,f:FilterValues){
 const conditions=["owner=?",`COALESCE(${j('tool')}, '') NOT LIKE '%upload%'`],args:any[]=[owner];
 const add=(sql:string,value:any)=>{conditions.push(sql);args.push(value)};
 if(f.start)add(fields.day+'>=?',f.start);if(f.end)add(fields.day+'<=?',f.end);
 for(const key of ['person','author','project','costProject','kind','model','resolution','status'] as const)if(f[key])add(fields[key]+'=?',f[key]);
 if(f.source==='computed'){conditions.push(`${fields.source} IN ('calculated','rule')`)}else if(f.source==='actual'){conditions.push(`${fields.source} IN ('provider','manual')`)}else if(f.source==='review'){conditions.push(`${fields.source} IN ('range','unknown')`)}else if(f.source)add(fields.source+'=?',f.source);
 if(f.folder){if(f.descendants==='true'){conditions.push(`(${j('folder')}=? OR EXISTS(SELECT 1 FROM json_each(COALESCE(${j('folderAncestors')}, '[]')) WHERE value=?))`);args.push(f.folder,f.folder)}else add(j('folder')+'=?',f.folder)}
 if(f.minSeconds)add(j('duration')+'>=?',Number(f.minSeconds));if(f.maxSeconds)add(j('duration')+'<=?',Number(f.maxSeconds));
 if(f.search){const pattern='%'+f.search.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%';conditions.push(`(${j('name')} LIKE ? ESCAPE '\\' OR ${j('prompt')} LIKE ? ESCAPE '\\' OR ${j('note')} LIKE ? ESCAPE '\\' OR ${j('workSummary')} LIKE ? ESCAPE '\\')`);args.push(pattern,pattern,pattern,pattern)}
 return {sql:conditions.join(' AND '),args};
}
export const STATS_SQL=`COUNT(*) AS total,
 COALESCE(SUM(CASE WHEN ${j('credits')} IS NOT NULL AND ${fields.source} IN ('provider','manual','calculated','rule','free') THEN ${fields.credits} ELSE 0 END),0) AS points,
 COALESCE(SUM(CASE WHEN ${fields.source} IN ('provider','manual') THEN ${fields.credits} ELSE 0 END),0) AS actualPoints,
 COALESCE(SUM(CASE WHEN ${fields.source} IN ('calculated','rule') THEN ${fields.credits} ELSE 0 END),0) AS calculatedPoints,
 COALESCE(SUM(CASE WHEN ${fields.source}='estimate' THEN ${fields.credits} ELSE 0 END),0) AS estimatedPoints,
 COALESCE(SUM(CASE WHEN ${fields.source}='range' THEN COALESCE(${j('quote.range.min')},0) ELSE 0 END),0) AS rangeMin,
 COALESCE(SUM(CASE WHEN ${fields.source}='range' THEN COALESCE(${j('quote.range.max')},0) ELSE 0 END),0) AS rangeMax,
 SUM(CASE WHEN ${fields.source}='range' THEN 1 ELSE 0 END) AS rangeCount,
 SUM(CASE WHEN ${fields.source}='unknown' OR (${j('credits')} IS NULL AND ${fields.source}<>'range') THEN 1 ELSE 0 END) AS unpriced,
 SUM(CASE WHEN ${fields.kind}='video' AND ${fields.status} IN ('completed','success','succeeded') THEN 1 ELSE 0 END) AS videos,
 SUM(CASE WHEN ${fields.kind}='image' AND ${fields.status} IN ('completed','success','succeeded') THEN 1 ELSE 0 END) AS images,
 SUM(CASE WHEN ${fields.kind}='audio' THEN 1 ELSE 0 END) AS audio,
 SUM(CASE WHEN ${j('tool')}='video-generator' AND ${fields.status} IN ('completed','success','succeeded') THEN 1 ELSE 0 END) AS generatedVideos,
 SUM(CASE WHEN ${j('tool')}='video-modify' AND ${fields.status} IN ('completed','success','succeeded') THEN 1 ELSE 0 END) AS editedVideos,
 COALESCE(SUM(CASE WHEN ${fields.kind}='video' AND ${fields.status} IN ('completed','success','succeeded') THEN ${fields.duration} ELSE 0 END),0) AS seconds,
 COALESCE(SUM(CASE WHEN ${fields.kind}='video' AND ${fields.status} IN ('completed','success','succeeded') THEN CAST(COALESCE(${j('actualDuration')},${j('duration')},0) AS REAL) ELSE 0 END),0) AS actualSeconds,
 SUM(CASE WHEN ${fields.status} IN ('failed','error') THEN 1 ELSE 0 END) AS failedCount,
 SUM(CASE WHEN ${fields.source}='estimate' THEN 1 ELSE 0 END) AS estimatedCount,
 SUM(CASE WHEN COALESCE(${j('version')},0)<4 THEN 1 ELSE 0 END) AS needsUpgrade,
 COUNT(DISTINCT ${fields.person}) AS people,
 COUNT(DISTINCT CASE WHEN ${j('costProjectSource')}='unassigned' THEN NULL ELSE ${fields.costProject} END) AS projectCount,
 MIN(${fields.day}) AS firstDay,MAX(${fields.day}) AS lastDay`;
const GROUPS:Record<string,string>={costProject:fields.costProject,person:fields.person,model:fields.model,day:fields.day,matrix:`json_array(${fields.day},${fields.person},${fields.costProject},${fields.model})`};
export async function queryLedger(owner:string,params:URLSearchParams){
 const f=parseFilters(params),w=whereFor(owner,f),page=Math.max(1,Math.min(100000,Number(params.get('page'))||1)),perPage=Math.max(10,Math.min(100,Number(params.get('perPage'))||25));
 const groupBy=params.get('groupBy')||'costProject',groupExpr=GROUPS[groupBy]||GROUPS.costProject,groupPage=Math.max(1,Math.min(100000,Number(params.get('groupPage'))||1));
 const values=w.args;
 const [summary,rows,totalAll,groupCount,groups,trend,stateRows,options]=await Promise.all([
  db().prepare(`SELECT ${STATS_SQL} FROM records INDEXED BY idx_records_fast WHERE ${w.sql}`).bind(...values).first(),
  db().prepare(`SELECT data FROM records INDEXED BY idx_records_fast WHERE ${w.sql} ORDER BY ${j('createdAt')} DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,perPage,(page-1)*perPage).all(),
  db().prepare(`SELECT COUNT(*) AS total FROM records INDEXED BY idx_records_fast WHERE owner=? AND COALESCE(${j('tool')},'') NOT LIKE '%upload%'`).bind(owner).first(),
  db().prepare(`SELECT COUNT(*) AS total FROM (SELECT ${groupExpr} AS k FROM records INDEXED BY idx_records_fast WHERE ${w.sql} GROUP BY k)`).bind(...values).first(),
  db().prepare(`SELECT ${groupExpr} AS groupKey,MIN(${fields.person}) AS person,MIN(${fields.costProject}) AS costProject,MIN(${fields.day}) AS day,MIN(${fields.model}) AS modelSlug,MIN(${fields.modelName}) AS modelName,COUNT(DISTINCT ${fields.model}) AS modelCount, ${STATS_SQL} FROM records INDEXED BY idx_records_fast WHERE ${w.sql} GROUP BY groupKey ORDER BY points DESC,total DESC,groupKey LIMIT 25 OFFSET ?`).bind(...values,(groupPage-1)*25).all(),
  db().prepare(`SELECT ${fields.day} AS day,${STATS_SQL} FROM records INDEXED BY idx_records_fast WHERE ${w.sql} AND ${fields.day} IS NOT NULL GROUP BY day ORDER BY day DESC LIMIT 30`).bind(...values).all(),
  db().prepare("SELECT key,data FROM state WHERE owner=? AND key IN ('balance','snapshots','settings','rules','sync','upgrade','folders','syncLog')").bind(owner).all(),
  db().prepare(`SELECT json_group_array(DISTINCT ${fields.person}) AS people,json_group_array(DISTINCT ${fields.author}) AS authors,json_group_array(DISTINCT ${fields.costProject}) AS costProjects,json_group_array(DISTINCT json_array(${fields.person},${fields.costProject})) AS projectPairs,json_group_array(DISTINCT ${fields.project}) AS personalProjects,json_group_array(DISTINCT ${fields.resolution}) AS resolutions,json_group_array(DISTINCT ${fields.status}) AS statuses FROM records INDEXED BY idx_records_fast WHERE owner=? AND COALESCE(${j('tool')},'') NOT LIKE '%upload%'`).bind(owner).first<any>(),
 ]);
 const state=Object.fromEntries(stateRows.results.map((r:any)=>[r.key,JSON.parse(r.data)]));state.settings={...DEFAULT_SETTINGS,...state.settings};
 const modelOptions=await db().prepare(`SELECT ${fields.model} AS slug,MIN(${fields.modelName}) AS name,COUNT(*) AS count FROM records INDEXED BY idx_records_fast WHERE owner=? AND COALESCE(${j('tool')},'') NOT LIKE '%upload%' GROUP BY slug ORDER BY count DESC LIMIT 2000`).bind(owner).all();
 const modelBreakdown=await db().prepare(`SELECT ${fields.model} AS modelSlug,MIN(${fields.modelName}) AS modelName,${fields.kind} AS kind,${STATS_SQL} FROM records INDEXED BY idx_records_fast WHERE ${w.sql} GROUP BY ${fields.model},${fields.kind} ORDER BY points DESC,total DESC LIMIT 200`).bind(...values).all();
 const o:any={models:modelOptions.results,projectPairs:(JSON.parse(options?.projectPairs||'[]') as string[][]).filter(p=>p[0]&&p[1]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]))};for(const key of ['people','authors','costProjects','personalProjects','resolutions','statuses'])o[key]=JSON.parse(options?.[key]||'[]').filter(Boolean).sort((a:string,b:string)=>a.localeCompare(b));
 const sampleRows=await db().prepare(`SELECT data FROM records INDEXED BY idx_records_fast WHERE ${w.sql} ORDER BY ${j('createdAt')} DESC,id DESC LIMIT 5`).bind(...values).all();
 const quotes=await db().prepare("SELECT data FROM state WHERE owner=? AND key LIKE 'quote:%' ORDER BY json_extract(data,'$.at') DESC LIMIT 30").bind(owner).all();
 return {samples:sampleRows.results.map((r:any)=>JSON.parse(r.data)),quotes:quotes.results.map((r:any)=>JSON.parse(r.data)),records:rows.results.map((r:any)=>JSON.parse(r.data)),summary,allCount:(totalAll as any)?.total||0,page,perPage,groupBy,groupPage,groupTotal:(groupCount as any)?.total||0,groups:groups.results,modelBreakdown:modelBreakdown.results,trend:trend.results.reverse(),state,options:o,filters:f};
}
export async function exportRecords(owner:string,f:FilterValues,cursor:string){const w=whereFor(owner,f);const rows=await db().prepare(`SELECT id,data FROM records INDEXED BY idx_records_fast WHERE ${w.sql} AND id>? ORDER BY id LIMIT 500`).bind(...w.args,cursor).all();return {records:rows.results.map((r:any)=>JSON.parse(r.data)),cursor:rows.results.length===500?String(rows.results.at(-1)?.id):null}}
