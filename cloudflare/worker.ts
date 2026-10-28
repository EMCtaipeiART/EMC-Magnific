import {GET,POST} from '@/app/api/tracker/route';
import {initAuth,startAuth,finishAuth,isConnected,disconnect} from './mcp';
import {tick,getAuto,requestRun} from './sync-job';
import {getState,setState} from '@/lib/tracker/store';
export interface Env{DB:D1Database;ASSETS:Fetcher;ADMIN_PASSWORD:string;VIEW_PASSWORD?:string;SESSION_SECRET?:string}
type Role='admin'|'viewer';
const enc=new TextEncoder(),b64=(buf:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function hmac(env:Env,text:string){const key=await crypto.subtle.importKey('raw',enc.encode(env.SESSION_SECRET||env.ADMIN_PASSWORD||'x'),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc.encode(text)))}
const same=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
async function makeCookie(env:Env,role:Role,secure:boolean){const v=`${role}.${Date.now()+7*864e5}`;return `session=${v}.${await hmac(env,v)}; HttpOnly;${secure?' Secure;':''} SameSite=Lax; Path=/; Max-Age=${7*86400}`}
async function roleOf(req:Request,env:Env):Promise<Role|null>{
  const m=/(?:^|;\s*)session=([^;]+)/.exec(req.headers.get('Cookie')||'');if(!m)return null;
  const [role,exp,sig]=m[1].split('.');if(!sig||Number(exp)<Date.now()||(role!=='admin'&&role!=='viewer'))return null;
  return same(sig,await hmac(env,`${role}.${exp}`))?role:null;
}
const json=(data:any,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const redirect=(to:string,headers:Record<string,string>={})=>new Response(null,{status:302,headers:{Location:to,...headers}});
const loginPage=(error='')=>new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登入｜Magnific 點數追蹤</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f1ea;font:15px system-ui,"PingFang TC",sans-serif;color:#1f2a24}form{background:#fff;padding:32px;border-radius:14px;width:min(360px,90vw);box-shadow:0 8px 30px rgba(0,0,0,.08);display:grid;gap:14px}h1{margin:0;font-size:20px}p{margin:0;color:#5b665f;font-size:13px}input{padding:11px 12px;border:1px solid #c8cfc2;border-radius:8px;font:inherit}button{padding:11px;border:0;border-radius:8px;background:#2e6a50;color:#fff;font:inherit;cursor:pointer}.err{color:#b3261e}</style></head><body><form method="post" action="/login"><h1>Magnific 點數追蹤</h1><p>EMC 創作成本工作台，請輸入密碼。</p><input type="password" name="password" placeholder="密碼" autofocus autocomplete="current-password" required>${error?`<p class="err">${error}</p>`:''}<button type="submit">登入</button></form></body></html>`,{status:error?401:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
async function login(req:Request,env:Env){
  const ip=req.headers.get('CF-Connecting-IP')||'unknown',key='fail:'+ip,rec=await getState('login',key,{n:0,until:0});
  if(rec.until>Date.now())return loginPage('嘗試次數過多，請稍後再試。');
  const pw=String((await req.formData()).get('password')||'');
  const h=await hmac(env,'pw:'+pw);
  const role:Role|null=env.ADMIN_PASSWORD&&same(h,await hmac(env,'pw:'+env.ADMIN_PASSWORD))?'admin':env.VIEW_PASSWORD&&same(h,await hmac(env,'pw:'+env.VIEW_PASSWORD))?'viewer':null;
  if(!role){const n=rec.n+1;await setState('login',key,{n:n>=5?0:n,until:n>=5?Date.now()+5*60000:0});return loginPage('密碼不正確。')}
  await setState('login',key,{n:0,until:0});
  return redirect('/',{'Set-Cookie':await makeCookie(env,role,new URL(req.url).protocol==='https:')});
}
export default {
  async fetch(req:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(req.url),path=url.pathname;
    if(!env.ADMIN_PASSWORD)return new Response('尚未設定 ADMIN_PASSWORD（請執行 wrangler secret put ADMIN_PASSWORD）。',{status:503});
    if(path==='/login')return req.method==='POST'?login(req,env):loginPage();
    if(path==='/logout')return redirect('/login',{'Set-Cookie':'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});
    const role=await roleOf(req,env);
    if(!role)return path.startsWith('/api/')||path.startsWith('/auth/')?json({error:'請先登入。'},401):redirect('/login');
    const admin=role==='admin';
    await initAuth(url.origin);
    if(path==='/api/tracker'){
      if(req.method==='POST'&&!admin)return json({error:'唯讀模式：只有管理員可以修改或同步。'},403);
      return req.method==='POST'?POST(req):GET(req);
    }
    if(path==='/auth/status'){const auto=await getAuto();return json({admin,connected:await isConnected(),scheduler:{running:auto.phase!=='idle',mode:auto.mode,lastOk:auto.lastOk,lastError:auto.lastError,page:auto.page,pages:auto.pages,processed:auto.processed}})}
    if(path.startsWith('/auth/')){
      if(!admin)return json({error:'需要管理員權限。'},403);
      if(path==='/auth/start')return redirect(await startAuth());
      if(path==='/auth/callback'){const code=url.searchParams.get('code');if(!code)return redirect('/?auth=denied');await finishAuth(code);await requestRun('full');ctx.waitUntil(tick());return redirect('/?connected=1')}
      if(path==='/auth/disconnect'&&req.method==='POST'){await disconnect();return json({ok:true})}
      if(path==='/auth/sync-now'&&req.method==='POST'){const r=await requestRun(url.searchParams.get('mode')==='full'?'full':'recent');if(r.started)ctx.waitUntil(tick());return json(r)}
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event:ScheduledController,_env:Env,ctx:ExecutionContext){
    ctx.waitUntil((async()=>{await initAuth();await tick()})());
  },
};
