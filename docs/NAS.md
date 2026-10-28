# NAS 部署（Docker）

自動從 Magnific 官方 MCP 讀取作品紀錄，存在 NAS 的 SQLite，同事用瀏覽器唯讀查看。

## 安裝
1. 把整個專案資料夾放到 NAS（或 `git clone`）。
2. 編輯 `docker-compose.yml`：
   - `PUBLIC_URL`：瀏覽器實際輸入的網址，例如 `http://192.168.1.50:8080`。
   - `ADMIN_PASSWORD`、`SESSION_SECRET`：改成自己的值。
3. 執行 `docker compose up -d --build`（Synology：Container Manager → 專案 → 新增）。
4. 開 `PUBLIC_URL`，右上角「管理員登入」→「連接 Magnific」，在 Magnific 頁面登入並同意授權一次。
5. 授權後自動讀取全部歷史，之後每小時增量同步（`SYNC_INTERVAL_MIN`）。

## 權限
- 所有人可唯讀查看；只有管理員可連接、同步、改歸屬、改費率。
- Magnific 授權（含 refresh token）存在 `./data/magnific-auth.json`，等同你的帳號權限，請勿外流；NAS 勿對外網開放，建議只限內網。
- 只呼叫唯讀工具（作品搜尋／詳細、資料夾、餘額、試算費用），不會生成任何收費內容。

## 備份／更新
- 備份 `./data` 資料夾即可。更新：`git pull && docker compose up -d --build`。
- 授權失效時頁面頂端會顯示錯誤，管理員按「連接 Magnific」重新授權，已存資料不受影響。

## 同事入口（唯讀）
- 同事直接開 `PUBLIC_URL`，不用登入就能看：成本總覽、所有生成紀錄、影片詳細紀錄、專案成本彙整、CSV／文字報表匯出。
- 唯讀模式會自動隱藏：同步、更新餘額、補齊紀錄、批次歸屬、單筆修改、「歸屬與費率」頁。
- 管理員登入後這些功能才會出現。伺服器端也會拒絕未登入者的所有寫入請求，不只是隱藏按鈕。
