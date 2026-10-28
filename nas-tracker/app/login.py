"""開啟有畫面的瀏覽器，手動登入（含兩步驟驗證）後關閉視窗，登入狀態存進 PROFILE_DIR。"""
from playwright.sync_api import sync_playwright
from . import config

def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(config.PROFILE_DIR, headless=False)
        ctx.new_page().goto("https://www.magnific.com/")
        input("登入完成後按 Enter 結束…")
        ctx.close()

if __name__ == "__main__":
    main()
