# NAS Tracker（Synology Container Manager）

1. `cp .env.example .env` 並修改儀表板密碼。
2. 首次登入：在有螢幕的電腦執行 `pip install -r requirements.txt && python -m app.login`，登入後把產生的 `data/browser-profile` 複製到 NAS 的 data 目錄。
3. 填入 `app/config.py` 的網址與選擇器（待提供登入後頁面結構）。
4. Container Manager 建立專案指向本資料夾，啟動後開 `http://NAS-IP:8080`。
5. `/export.csv` 可匯入既有帳本網站。

共用單一帳號：網站無法分辨操作者，「人員／專案」需由同事在帳本中手動歸屬。
