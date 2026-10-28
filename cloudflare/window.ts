/** Automatic scans only run Mon–Fri 08:00–20:00 Taipei time; the admin's "立即同步" is exempt. */
export function inScanWindow(now=Date.now()){const t=new Date(now+8*3600000),day=t.getUTCDay(),h=t.getUTCHours();return day>=1&&day<=5&&h>=8&&h<20}
