// Re-derives person / work-project attribution from stored folder data (no Magnific calls).
// Bump CLASSIFY_VERSION whenever the attribution rules in lib/tracker/domain.ts change.
import {db,getState,setState,saveRecords} from '@/lib/tracker/store';
import {classify,folderLineage,GENERIC_FOLDER,peopleOf} from '@/lib/tracker/domain';
import {DEFAULT_SETTINGS} from '@/lib/tracker/types';
import type {LedgerRecord} from '@/lib/tracker/types';
import {OWNER} from './shims/chatgpt-auth';
import {bumpDataVersion} from './data-version';
const CLASSIFY_VERSION=1;
export async function reclassifyAll(deadline:number):Promise<boolean>{
  if((await getState(OWNER,'classifyV',0))>=CLASSIFY_VERSION)return true;
  const folders=await getState(OWNER,'folders',[]),settings={...DEFAULT_SETTINGS,...await getState(OWNER,'settings',{})},people=peopleOf(folders,settings);
  let cursor:string=await getState(OWNER,'classifyCursor','');
  while(Date.now()<deadline){
    const rows=await db().prepare('SELECT data FROM records WHERE owner=? AND id>? ORDER BY id LIMIT 300').bind(OWNER,cursor).all();
    if(!rows.results.length){await setState(OWNER,'classifyV',CLASSIFY_VERSION);await bumpDataVersion();await setState(OWNER,'classifyCursor','');return true}
    const records:LedgerRecord[]=rows.results.map((r:any)=>JSON.parse(r.data)),changed:LedgerRecord[]=[];
    for(const r of records){
      const lineage=folderLineage(r.folder,r.project,folders),rootName=lineage.root?.name||r.personalProjectName||'',personalName=settings.projectPeople?.[r.project]||rootName,inferred=personalName&&!GENERIC_FOLDER.test(personalName)?personalName:'',cls=classify(lineage,inferred,people);
      const next:Partial<LedgerRecord>={};
      if(r.costProjectSource!=='manual'){next.costProject=cls.business?.name||'未分類工作專案';next.costProjectSource=cls.business?'folder':'unassigned'}
      if(r.personSource!=='manual'){const assigned=inferred||cls.folderPerson;next.person=assigned||r.author&&r.author!=='平台未提供'?assigned||r.author:'未指定';next.personSource=assigned?'personal-project':r.author&&r.author!=='平台未提供'?'author':'unknown'}
      if(Object.entries(next).some(([k,v])=>(r as any)[k]!==v))changed.push({...r,...next});
    }
    await saveRecords(OWNER,changed);cursor=records.at(-1)!.id;await setState(OWNER,'classifyCursor',cursor);
  }
  return false;
}
