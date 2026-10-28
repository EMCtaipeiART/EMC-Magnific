"""用 Playwright 持久化設定檔讀取 Magnific。首次請執行 `python -m app.login` 手動登入一次。"""
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
from . import config
from .db import conn

def scrape():
    if not (config.SEL_BALANCE and config.SEL_HISTORY_ROW):
        raise RuntimeError("尚未設定選擇器（app/config.py），請先提供登入後頁面結構")
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(config.PROFILE_DIR, headless=True)
        page = ctx.new_page()
        page.goto(config.USAGE_URL, wait_until="networkidle")
        balance = float(page.locator(config.SEL_BALANCE).first.inner_text().replace(",", "").strip())
        rows = page.locator(config.SEL_HISTORY_ROW).all()
        # TODO: 依實際欄位解析 rows -> (work_id, created_at, tool, credits, prompt)
        now = datetime.now(timezone.utc).isoformat()
        with conn() as c:
            c.execute("INSERT INTO balance_snapshots(taken_at,balance) VALUES(?,?)", (now, balance))
        ctx.close()
        return balance, len(rows)

if __name__ == "__main__":
    print(scrape())
