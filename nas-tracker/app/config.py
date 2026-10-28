"""集中設定。選擇器等網站相關資訊待取得登入後頁面結構再填入。"""
import os

DATA_DIR = os.environ.get("DATA_DIR", "./data")
DB_PATH = os.path.join(DATA_DIR, "tracker.db")
PROFILE_DIR = os.path.join(DATA_DIR, "browser-profile")  # 保存登入狀態
SCRAPE_HOURS = [int(h) for h in os.environ.get("SCRAPE_HOURS", "9,18").split(",") if h.strip()]

# TODO: 待確認（需登入後頁面截圖／HTML）
USAGE_URL = "https://www.magnific.com/"           # 用量／生成紀錄頁網址
SEL_BALANCE = ""                                   # 點數餘額元素
SEL_HISTORY_ROW = ""                               # 生成紀錄每一列
