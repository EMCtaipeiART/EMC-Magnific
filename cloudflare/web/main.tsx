import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '@/app/tracker-dashboard';
import '@/app/globals.css';
import './admin.css';
type Status={admin:boolean;connected:boolean;scheduler:{running:boolean;mode?:string;lastOk?:string;lastError?:string;page?:number;pages?:number;processed?:number}};
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
    {!st.connected?'尚未連接 Magnific':s.running?`同步中… 第 ${s.page||0}${s.pages?` / ${s.pages}`:''} 批`:s.lastError?`同步失敗：${s.lastError}`:`上次自動同步：${fmt(s.lastOk)}`}
    {!st.admin&&<span className="muted">· 唯讀</span>}
  </div><div className="admin-actions">
    {st.admin?<>
      {st.connected?<><button disabled={s.running} onClick={()=>post('/auth/sync-now')}>立即同步</button><button disabled={s.running} onClick={()=>confirm('重新讀取全部歷史紀錄，可能需要數分鐘。繼續？')&&post('/auth/sync-now?mode=full')}>完整重新同步</button><button onClick={()=>confirm('中斷與 Magnific 的連線？已存的紀錄會保留。')&&post('/auth/disconnect')}>中斷連接</button></>:<a className="primary" href="/auth/start">連接 Magnific</a>}
    </>:null}
    <a href="/logout">登出</a>
  </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminBar/><Dashboard/></React.StrictMode>);
