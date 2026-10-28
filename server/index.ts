import {createServer} from 'node:http';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {GET,POST} from '@/app/api/tracker/route';
import {startAuth,finishAuth,isConnected,disconnect,PUBLIC_URL} from './magnific-mcp';
import {startScheduler,schedulerStatus,syncNow} from './scheduler';
const PORT=Number(process.env.PORT)||8080,STATIC=process.env.STATIC_DIR||'./dist-server/public';
let adminPassword=process.env.ADMIN_PASSWORD||'';
if(!adminPassword){adminPassword=randomBytes(9).toString('base64url');console.warn(`[安全] 未設定 ADMIN_PASSWORD，本次啟動臨時管理員密碼：${adminPassword}`)}
const secret=process.env.SESSION_SECRET||randomBytes(32).toString('hex');
const sign=(v:string)=>createHmac('sha256',secret).update(v).digest('base64url');
const same=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const makeSession=()=>{const exp=String(Date.now()+7*864e5);return exp+'.'+sign(exp)};
function isAdmin(req:any){const m=/(?:^|;\s*)admin=([^;]+)/.exec(req.headers.cookie||'');if(!m)return false;const [exp,sig]=m[1].split('.');return !!sig&&Number(exp)>Date.now()&&same(sig,sign(exp))}
const attempts=new Map<string,{n:number;until:number}>();
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
async function body(req:any,limit=200000){const chunks:Buffer[]=[];let n=0;for await(const c of req){n+=c.length;if(n>limit)throw new Error('資料過大');chunks.push(c)}return Buffer.concat(chunks)}
function json(res:any,data:any,status=200,headers:Record<string,string>={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data))}
const origin=(req:any)=>`http://${req.headers.host||'localhost'}`;
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',origin(req)),path=url.pathname;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    if(path==='/api/tracker'){
      if(req.method==='POST'&&!isAdmin(req))return json(res,{error:'唯讀模式：請先由右上角「管理員登入」後再修改或同步。'},403);
      const init:any={method:req.method,headers:req.headers as any};if(req.method==='POST'){init.body=await body(req)}
      const r=await (req.method==='POST'?POST:GET)(new Request(url,init));
      res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
    }
    if(path==='/auth/status')return json(res,{admin:isAdmin(req),connected:isConnected(),scheduler:schedulerStatus()});
    if(path==='/auth/login'&&req.method==='POST'){
      const ip=String(req.socket.remoteAddress),a=attempts.get(ip);if(a&&a.until>Date.now())return json(res,{error:'嘗試次數過多，請稍後再試。'},429);
      const {password=''}=JSON.parse((await body(req,2000)).toString()||'{}');
      if(!same(String(password),adminPassword)){const n=(a?.n||0)+1;attempts.set(ip,{n,until:n>=5?Date.now()+60000:0});return json(res,{error:'密碼不正確。'},401)}
      attempts.delete(ip);return json(res,{ok:true},200,{'Set-Cookie':`admin=${makeSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7*86400}`});
    }
    if(path==='/auth/logout')return json(res,{ok:true},200,{'Set-Cookie':'admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
    if(path==='/auth/start'){if(!isAdmin(req)){res.writeHead(302,{Location:'/?login=1'});return res.end()}res.writeHead(302,{Location:await startAuth()});return res.end()}
    if(path==='/auth/callback'){
      if(!isAdmin(req)){res.writeHead(302,{Location:'/?login=1'});return res.end()}
      const code=url.searchParams.get('code');if(!code){res.writeHead(302,{Location:'/?auth=denied'});return res.end()}
      await finishAuth(code);syncNow('full');res.writeHead(302,{Location:'/?connected=1'});return res.end();
    }
    if(path==='/auth/disconnect'&&req.method==='POST'){if(!isAdmin(req))return json(res,{error:'需要管理員權限。'},403);disconnect();return json(res,{ok:true})}
    if(path==='/auth/sync-now'&&req.method==='POST'){if(!isAdmin(req))return json(res,{error:'需要管理員權限。'},403);return json(res,syncNow(url.searchParams.get('mode')==='full'?'full':'recent'))}
    // static files with SPA fallback
    let file=normalize(join(STATIC,path==='/'?'index.html':path));if(!file.startsWith(normalize(STATIC)))file=join(STATIC,'index.html');
    try{if(!(await stat(file)).isFile())throw 0}catch{file=join(STATIC,'index.html')}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':MIME[extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'});res.end(data);
  }catch(e:any){console.error(e);json(res,{error:'伺服器處理失敗。'},500)}
}).listen(PORT,()=>{console.log(`EMC Magnific 點數追蹤已啟動：${PUBLIC_URL()}（埠 ${PORT}）`);startScheduler()});
