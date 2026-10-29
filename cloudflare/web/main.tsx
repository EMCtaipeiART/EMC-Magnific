import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '@/app/tracker-dashboard';
import '@/app/globals.css';
import './admin.css';
type Status={admin:boolean;connected:boolean;scheduler:{inWindow?:boolean;running:boolean;mode?:string;lastOk?:string;lastError?:string;page?:number;pages?:number;processed?:number}};
const fmt=(s?:string)=>s?new Date(s).toLocaleString('zh-TW',{hour12:false}):'尚未同步';
function AdminBar(){
  const [st,setSt]=useState<Status|null>(null);
  const load=useCallback(async()=>{try{setSt(await (await fetch('/auth/status')).json())}catch{}},[]);
  const running=st?.scheduler.running;
  useEffect(()=>{load();const t=setInterval(load,running?3000:20000);return()=>clearInterval(t)},[load,running]);
  async function post(path:string){await fetch(path,{method:'POST'});load()}
  useEffect(()=>{document.documentElement.dataset.readonly=st&&st.admin?'0':'1'},[st?.admin]);
  if(!st)return null;const s=st.scheduler;
  return <div className="admin-bar"><div className="admin-status">
    <span className={'dot '+(st.connected?(s.lastError?'warn':'ok'):'off')}/>
    {!st.connected?'尚未連接 Magnific':s.running?`同步中… 第 ${s.page||0}${s.pages?` / ${s.pages}`:''} 批${s.lastError?`（上次錯誤：${s.lastError}）`:''}`:s.lastError?`同步失敗：${s.lastError}`:`上次自動同步：${fmt(s.lastOk)}`}<span className="muted">· 平日 08:00–20:00 每 10 分鐘自動掃描{s.inWindow?'':'（目前非掃描時段）'}</span>
    {!st.admin&&<span className="muted">· 唯讀</span>}
  </div><div className="admin-actions">
    {st.admin?<>
      {st.connected?<><button disabled={s.running} onClick={()=>post('/auth/sync-now')}>立即同步</button><button disabled={s.running} onClick={()=>confirm('重新讀取 2026-10-28 起的紀錄（更早的歷史紀錄不會補抓，已存的保留）。繼續？')&&post('/auth/sync-now?mode=full')}>重新同步（自 10/28 起）</button><button onClick={()=>confirm('中斷與 Magnific 的連線？已存的紀錄會保留。')&&post('/auth/disconnect')}>中斷連接</button></>:<a className="primary" href="/auth/start">連接 Magnific</a>}
    </>:null}
    <a href="/logout">登出</a>
  </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminBar/><Dashboard/></React.StrictMode>);
