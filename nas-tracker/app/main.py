import csv, html, io, os, secrets, threading, time
from datetime import datetime, timedelta, timezone
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import HTMLResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from . import config
from .db import conn
from .scraper import scrape

app = FastAPI(title="EMC Magnific NAS Tracker")
security = HTTPBasic()

def auth(cred: HTTPBasicCredentials = Depends(security)):
    ok = secrets.compare_digest(cred.username, os.environ.get("DASH_USER", "emc")) and \
         secrets.compare_digest(cred.password, os.environ.get("DASH_PASSWORD", "change-me"))
    if not ok:
        raise HTTPException(401, headers={"WWW-Authenticate": "Basic"})

def _loop():
    tz = timezone(timedelta(hours=8))
    done = set()
    while True:
        now = datetime.now(tz)
        key = (now.date(), now.hour)
        if now.hour in config.SCRAPE_HOURS and key not in done:
            done.add(key)
            try: scrape()
            except Exception as e: print("scrape failed:", e)
        time.sleep(60)

@app.on_event("startup")
def start(): threading.Thread(target=_loop, daemon=True).start()

@app.get("/", response_class=HTMLResponse, dependencies=[Depends(auth)])
def home():
    with conn() as c:
        snaps = c.execute("SELECT * FROM balance_snapshots ORDER BY id DESC LIMIT 30").fetchall()
        gens = c.execute("SELECT * FROM generations ORDER BY created_at DESC LIMIT 100").fetchall()
    e = html.escape
    srows = "".join(f"<tr><td>{e(s['taken_at'])}</td><td>{s['balance']:,.0f}</td></tr>" for s in snaps)
    grows = "".join(
        f"<tr><td>{e(g['created_at'] or '')}</td><td>{e(g['tool'] or '')}</td><td>{g['credits'] or 0:,.0f}</td>"
        f"<td>{e(g['person'])}</td><td>{e(g['project'])}</td><td>{e((g['prompt'] or '')[:80])}</td></tr>"
        for g in gens)
    return f"<h1>Magnific 點數追蹤</h1><p><a href='/export.csv'>匯出 CSV（可匯入帳本）</a></p>" \
           f"<h2>餘額紀錄</h2><table border=1 cellpadding=6><tr><th>時間(UTC)</th><th>餘額</th></tr>{srows}</table>" \
           f"<h2>最近生成（100 筆）</h2><table border=1 cellpadding=6><tr><th>時間</th><th>工具</th><th>點數</th>" \
           f"<th>人員</th><th>專案</th><th>內容</th></tr>{grows}</table>"

@app.get("/export.csv", dependencies=[Depends(auth)])
def export():
    with conn() as c:
        gens = c.execute("SELECT * FROM generations ORDER BY created_at").fetchall()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["作品編號", "台北日期", "使用點數", "點數依據", "人員", "專案", "內容"])
    for g in gens:
        w.writerow([g["work_id"], (g["created_at"] or "")[:10], g["credits"], "平台作品點數",
                    g["person"], g["project"], g["prompt"]])
    return Response("﻿" + out.getvalue(), media_type="text/csv; charset=utf-8")
