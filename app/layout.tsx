import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Magnific 點數追蹤｜EMC',description:'照片、影片與個人專案的點數使用紀錄'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>}
