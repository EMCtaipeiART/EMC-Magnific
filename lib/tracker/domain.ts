import type {LedgerRecord, FolderInfo, TrackerSettings, PriceQuote, CostRule} from './types';
export const DATA_VERSION = 4;
export const UPLOAD_TOOLS = ['upload','upload-reference','video-upload','audio-upload','image-upload'];
export function isUpload(tool:string){return /(^|[-_])upload([-_]|$)/i.test(tool||'')}
export function finite(value:unknown):number|null {if(value===null||value===undefined||value===''||!['number','string'].includes(typeof value))return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null}
export function taipeiDay(value:string){const t=new Date(value).getTime();if(!Number.isFinite(t))return '';return new Date(t+8*3600000).toISOString().slice(0,10)}
export function tidy(value:unknown,max=500){return typeof value==='string'?value.trim().slice(0,max):''}
export function safeWebUrl(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&['www.magnific.com','magnific.com','www.freepik.com'].includes(u.hostname)?u.toString():''}catch{return ''}}
export function folderLineage(folder:string,project:string,folders:FolderInfo[]){const byId=new Map(folders.map(f=>[f.reference,f]));const path:FolderInfo[]=[];const seen=new Set<string>();let id=folder;while(id&&!seen.has(id)){seen.add(id);const f=byId.get(id);if(!f)break;path.unshift(f);if(id===project)break;id=f.parentReference||''}const root=byId.get(project);if(root&&!path.some(f=>f.reference===project))path.unshift(root);const business=path.find(f=>f.reference!==project);return {path,business,root}}
export const GENERIC_FOLDER=/^(personal( project)?|team project|default( project)?)$/i;
/** Person folders are the root projects; client work projects are the folders directly below a person's root. */
export function peopleOf(folders:FolderInfo[],settings?:TrackerSettings){return new Set([...folders.filter(f=>f.reference&&['project','project_default'].includes(f.type)).map(f=>f.name),...Object.values(settings?.projectPeople||{})].filter(n=>n&&!GENERIC_FOLDER.test(n)))}
export function classify(lineage:ReturnType<typeof folderLineage>,assigned:string,people:Set<string>){
 const below=lineage.path.filter(f=>f.reference!==lineage.root?.reference);
 const folderPerson=!assigned&&below[0]&&people.has(below[0].name)?below[0].name:'';
 const rest=folderPerson?below.slice(1):below;
 const business=rest.find(f=>!GENERIC_FOLDER.test(f.name)&&!people.has(f.name));
 return {folderPerson,business};
}
export function normalize(raw:any,lean:any,old:Partial<LedgerRecord>|undefined,folders:FolderInfo[],settings:TrackerSettings,models:Map<string,any>,now:string):LedgerRecord{
 const m=raw.metadata||{},project=raw.projectReference||lean?.projectReference||old?.project||'',folder=raw.folderReference||lean?.folderReference||old?.folder||project;
 const lineage=folderLineage(folder,project,folders),rootName=lineage.root?.name||old?.personalProjectName||'';
 const author=tidy(raw.author?.name||lean?.author?.name||old?.author,200);
 const personalName=tidy(settings.projectPeople?.[project]||rootName,100);
 const inferredPerson=personalName&&!GENERIC_FOLDER.test(personalName)?personalName:'',cls=classify(lineage,inferredPerson,peopleOf(folders,settings)),assignedPerson=inferredPerson||cls.folderPerson;
 const modelSlug=tidy(m.slug||m.mode||m.model,160),catalog=models.get(modelSlug),kind=raw.kind||(/video/.test(raw.tool)?'video':/audio|speech|music/.test(raw.tool)?'audio':'image');
 const original=(Array.isArray(m.mediaCollection)?m.mediaCollection:[]).find((x:any)=>x.type==='original')||{};
 const previous=tidy(m.previous||m.sourceCreationIdentifier||m.creationIdentifier,100);
 const refCounts:Record<string,number>={};for(const r of m.references||[])if(r.type)refCounts[r.type]=(refCounts[r.type]||0)+1;
 const width=finite(original.width??m.width),height=finite(original.height??m.height);
 const keptDimensions=old?.dimensionsSource==='file'&&old.modelSlug===modelSlug;
 const sourceSpec={...m};delete sourceSpec.mediaCollection;delete sourceSpec.prompt;delete sourceSpec.inputPrompt;delete sourceSpec.references;delete sourceSpec.keyframes;
 for(const k of Object.keys(sourceSpec)){if(typeof sourceSpec[k]==='string'&&String(sourceSpec[k]).length>1000)delete sourceSpec[k]}
 const recordedCredits=finite(raw.credits)??finite(m.credits);
 const data:LedgerRecord={
 version:DATA_VERSION,id:raw.identifier,name:tidy(raw.name||lean?.name||old?.name||m.inputPrompt||m.prompt||'未命名作品',1000),prompt:tidy(m.inputPrompt||m.prompt||lean?.prompt||old?.prompt,6000),tool:raw.tool||lean?.tool||old?.tool||'',kind,status:raw.status||old?.status||'unknown',createdAt:raw.createdAt||old?.createdAt||'',day:taipeiDay(raw.createdAt||old?.createdAt||''),family:raw.family||old?.family,
 project,folder,personalProjectName:rootName,folderName:lineage.path.at(-1)?.name||old?.folderName||'',folderPath:lineage.path.map(f=>f.name).join(' / '),folderAncestors:lineage.path.map(f=>f.reference),
 costProject:old?.costProjectSource==='manual'?old.costProject||'':cls.business?.name||'未分類工作專案',costProjectSource:old?.costProjectSource==='manual'?'manual':cls.business?'folder':'unassigned',
 person:old?.personSource==='manual'?old.person||'未指定':assignedPerson||author||'未指定',personSource:old?.personSource==='manual'?'manual':assignedPerson?'personal-project':author?'author':'unknown',author:author||'平台未提供',authorId:raw.author?.id||lean?.author?.id||old?.authorId,
 model:tidy(m.model||m.mode||modelSlug,160),modelSlug,modelName:tidy(m.modelName||catalog?.name||m.model||m.mode||raw.tool,160),mode:tidy(m.mode,100),provider:tidy(m.api||catalog?.api,100),duration:finite(m.duration??m.durationSeconds),actualDuration:finite(original.duration??m.exactDuration??((finite(m.frameCount)&&finite(m.exactFps??m.fps))?Number(m.frameCount)/Number(m.exactFps??m.fps):m.duration)),
 width:keptDimensions?old.width??width:width,height:keptDimensions?old.height??height:height,reportedWidth:width,reportedHeight:height,dimensionsSource:keptDimensions?'file':width&&height?'metadata':'missing',resolution:tidy(m.resolution,50),aspectRatio:tidy(m.aspectRatio||catalog?.aspectRatio,50),fps:finite(original.exactFps??m.exactFps??m.fps),frameCount:finite(original.frameCount??m.frameCount),withSoundEffects:typeof m.withSoundEffects==='boolean'?m.withSoundEffects:null,noMusic:typeof m.noMusic==='boolean'?m.noMusic:null,quality:tidy(m.quality,50),variant:tidy(m.variant,80),tier:tidy(m.tier,50),seed:String(m.seed??''),codec:tidy(original.codec||m.originalCodec,100),previous,sourceWidth:finite(m.sourceWidth??m.inputWidth),sourceHeight:finite(m.sourceHeight??m.inputHeight),scale:tidy(m.scale||(/^\d+x$/.test(m.resolution||'')?m.resolution:''),20),referenceCounts:refCounts,spec:sourceSpec,
 credits:recordedCredits??old?.credits??null,creditSource:recordedCredits!==null?'provider':old?.creditSource||'unknown',providerCreditField:recordedCredits!==null?(finite(raw.credits)!==null?'credits':'metadata.credits'):old?.providerCreditField,quote:recordedCredits!==null?null:old?.quote||null,pricingError:recordedCredits!==null?'':old?.pricingError||'',note:old?.note||'',workSummary:old?.workSummary||'',syncedAt:now,changedAt:old?.changedAt,webUrl:safeWebUrl(raw.webUrl||old?.webUrl)
 };return data;
}
export function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)}
export interface PriceRequest {tool:string;args:Record<string,unknown>;key:string;problem?:string;formula:string}
export function priceRequest(r:LedgerRecord):PriceRequest{
 let tool='',args:Record<string,unknown>={},problem='',formula='';
 const put=(k:string,v:unknown)=>{if(v!==null&&v!==undefined&&v!=='')args[k]=v};
 if(r.tool==='text-to-image'||r.tool==='image-generator'){
   tool='images_generate';args={mode:r.modelSlug,count:1,prompt:'Historical credit calculation; do not generate.'};put('resolution',r.resolution);put('aspectRatio',r.aspectRatio);put('quality',r.quality);put('variant',r.variant);put('tier',r.tier);
   if(!r.modelSlug||/auto/i.test(r.modelSlug))problem='缺少實際模型型號，不能以 Auto 代替歷史型號。';
   formula=`每張圖片 × 1；${r.modelName} / ${r.resolution||'未記錄解析度'}${r.quality?' / '+r.quality:''}${r.variant?' / '+r.variant:''}`;
 }else if(r.tool==='video-generator'){
   tool='video_generate';args={slug:r.modelSlug,prompt:'Historical credit calculation; do not generate.'};put('duration',r.duration);put('resolution',r.resolution);put('aspectRatio',r.aspectRatio);put('withSoundEffects',r.withSoundEffects);put('noMusic',r.noMusic);put('fps',r.fps);
   if(!r.modelSlug||r.duration===null||!r.resolution)problem='影片缺少模型、計費秒數或生成解析度。';
   // A video reference changes pricing for some models. Its duration is not recorded reliably.
   if(r.referenceCounts.video)problem='影片參考素材會影響費率，歷史紀錄未提供完整的參考影片計費秒數。';
   formula=`${r.modelName} / ${r.resolution} / ${r.duration??'?'} 秒${r.withSoundEffects===null?' / 音效未記錄':r.withSoundEffects?' / 有音效':' / 無音效'}`;
 }else if(r.tool==='video-modify'){
   tool='video_modify';args={slug:r.modelSlug,durationSeconds:r.duration};put('resolution',r.resolution);
   if(!r.modelSlug||r.duration===null||!r.resolution)problem='影片編輯缺少模型、來源秒數或解析度。';
   formula=`${r.modelName} / ${r.resolution} / 來源 ${r.duration??'?'} 秒`;
 }else if(r.tool==='enhance'&&/magnific/.test(r.modelSlug)){
   tool='images_upscale';args={mode:/sublime/.test(r.modelSlug)?'ultra-sublime':/photo/.test(r.modelSlug)?'ultra-photo':/denois/.test(r.modelSlug)?'ultra-denoiser':/precision|ultra/.test(r.modelSlug)?'ultra':'creative'};put('scale',r.scale);
   // An output creation is not the input: do not use its dimensions as the source size.
   if(r.sourceWidth&&r.sourceHeight){args.width=r.sourceWidth;args.height=r.sourceHeight}
   formula=`Magnific ${String(args.mode)} / ${r.scale||'倍率未記錄'}；依原圖尺寸分級`;
 }else if(r.tool==='enhance'&&r.modelSlug==='enhance-hq'){
   problem='Classic HQ 是舊版增強工具，官方試算不接受該型號；請以當時費率建立自訂規則。';formula='Classic HQ 圖片增強';
 }else if(['remove-background','background-remover'].includes(r.tool)){
   tool='images_remove_background';args={};formula='圖片去背 × 1';
 }else if(['retouch','inpaint'].includes(r.tool)){
   tool='images_retouch';args={model:r.modelSlug};put('resolution',r.resolution);put('mode',r.spec.retouchMode||r.spec.editMode);formula=`局部修圖 / ${r.modelName} / ${r.resolution}`;
 }else if(r.tool==='reimagine'){
   tool='images_reimagine';args={mode:r.mode};formula=`圖片重繪 / ${r.mode}`;
 }else if(['relight','image-relight'].includes(r.tool)){
   tool='images_relight';args={numImages:1};put('resolution',r.resolution);formula=`圖片重新打光 × 1 / ${r.resolution}`;
 }else if(r.tool==='video-upscale'){
   tool='video_upscale';args={mode:r.spec.upscaleMode||r.mode,durationSeconds:r.duration};for(const k of ['targetResolution','targetFps','upscaleFactor','enhancementModel','preview','fpsBoost','premiumQuality','turbo'])put(k,r.spec[k]);if(r.duration===null||!r.previous)problem='影片放大缺少來源秒數或原始素材關聯。';formula=`影片放大 / ${r.modelName} / ${r.duration??'?'} 秒`;
 }else{
   problem='此歷史操作尚無可驗證的官方對應費率；可設定同型號的自訂費率。';formula=`${r.tool} / ${r.modelName}`;
 }
 const key=stable({tool,args,referenceCounts:r.referenceCounts,sourceWidth:r.sourceWidth,sourceHeight:r.sourceHeight});return {tool,args,key,problem,formula};
}
export function matchRule(r:LedgerRecord,rules:CostRule[]):CostRule|undefined{
 return rules.filter(x=>x.enabled&&x.tool===r.tool&&x.modelSlug===r.modelSlug&&(!x.resolution||x.resolution.toLowerCase()===r.resolution.toLowerCase())&&(!x.quality||x.quality===r.quality)&&(!x.variant||x.variant===r.variant)&&(!x.start||r.day>=x.start)&&(!x.end||r.day<=x.end)&&(x.duration===null||x.duration===r.duration)&&(x.sound==='any'||(x.sound==='on'?r.withSoundEffects===true:r.withSoundEffects===false))&&(x.unit!=='second'||r.duration!==null)).sort((a,b)=>{
 const score=(x:CostRule)=>Number(!!x.resolution)+Number(!!x.quality)+Number(!!x.variant)+Number(x.duration!==null)+Number(x.sound!=='any')+Number(!!x.start)+Number(!!x.end);
 return score(b)-score(a)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)
 })[0];
}
export function ruleQuote(r:LedgerRecord,rule:CostRule,now:string):PriceQuote{const qty=rule.unit==='second'?r.duration!:1;return {key:stable({ruleId:rule.id,ruleVersion:rule.updatedAt,qty}),tool:r.tool,args:{model:r.modelSlug,resolution:r.resolution,quantity:qty,unit:rule.unit,rate:rule.rate},at:now,certainty:'exact',credits:Math.round(qty*rule.rate*100)/100,formula:`${rule.label}：${qty} ${rule.unit==='second'?'秒':'件'} × ${rule.rate} 點 = ${Math.round(qty*rule.rate*100)/100} 點`,ruleId:rule.id,ruleVersion:rule.updatedAt,reason:rule.note}}
export function applyQuote(r:LedgerRecord,quote:PriceQuote|null,error=''):LedgerRecord{
 if(['provider','manual','estimate'].includes(r.creditSource))return {...r,quote:quote||r.quote,pricingError:error};
 if(!['completed','success','succeeded'].includes(r.status))return {...r,quote,credits:null,creditSource:'unknown',pricingError:'作品尚未成功完成；扣點及退款需另行核實。'};
 if(!quote)return {...r,quote:null,credits:null,creditSource:'unknown',pricingError:error};
 if(quote.certainty==='exact'&&quote.credits!==null)return {...r,quote,credits:quote.credits,creditSource:quote.ruleId?'rule':'calculated',pricingError:''};
 if(quote.range&&(quote.range.min!==undefined||quote.range.max!==undefined))return {...r,quote,credits:null,creditSource:'range',pricingError:quote.reason||error};
 return {...r,quote,credits:null,creditSource:'unknown',pricingError:quote.reason||error||'官方費率無法得出單一扣點。'};
}
export function csvCell(v:unknown){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
