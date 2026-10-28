# EMC Magnific 創作成本工作台

線上使用：**https://emc-art.com/EMC-Magnific/**

GitHub Pages 網址 https://emctaipeiart.github.io/EMC-Magnific/ 會導向帳號既有的自訂網域，已啟用 HTTPS。

GitHub Pages 版本免登入，直接在瀏覽器匯入 CSV／JSON，整理 Magnific 的點數、生成規格、人員歸屬與專案成本。

## 使用方式

1. 開啟網站，點選「匯入明細」。
2. 選擇原工作台匯出的 CSV、此網站的完整 JSON 備份，或包含作品 `metadata` 的 JSON。
3. 核對新增與更新筆數後確認匯入。重複的作品編號會合併，預設保留人工歸屬、備註與已核實點數。
4. 使用人員、日期、工作專案、模型、影片秒數與解析度篩選；可切換到「影片詳細紀錄」或「專案成本彙整」。
5. 在「歸屬與費率」設定每 1,000 點實際成本，或新增適用於特定型號、日期與規格的費率。
6. 修改單筆內容摘要與人員／專案歸屬，或批次調整目前篩選範圍。
7. 匯出 CSV 明細或文字報表；定期下載「完整備份」JSON，以便還原及換裝置。

### 資料與計點

- 明細保存在目前瀏覽器的 IndexedDB。網站不會把匯入檔案送到 GitHub，也不會自動跨裝置同步。
- 清除網站資料、使用無痕模式或換瀏覽器時，可能需要重新匯入備份。
- 點數依據會分為平台作品點數、人工核實、官方回算、自訂費率、人工估算、區間與待查。未知值不當成 0。
- 平台與人工核實點數優先保留；人工估算另外列示，不混入核定成本。
- 生成成功、失敗、狀態未記錄分開處理。舊 CSV 缺少生成狀態時，不直接算成成功產出；若確定這批全部成功，可於匯入時勾選確認。
- 原始 JSON 未包含人員或專案資訊時，需要在匯入後手動歸屬；程式不會猜測實際操作者。
- GitHub Pages 版不直接呼叫 Magnific 或取得官方目前費率。可保留匯入的點數與回算結果，或使用自訂費率。

## CSV 格式

網站內可下載空白欄位範本。必要欄位為「作品編號」、「台北日期」、「使用點數」、「點數依據」（也接受「點數來源」）。完整匯出另保留人員、專案、模型型號、計費秒數、檔案片長、尺寸、解析度、FPS、音效、點數原始欄位、內容、提示詞與生成狀態。

JSON 備份格式：`{format: "emc-magnific-ledger", version: 1, records: [...], state: {...}, audit: [...]}`。還原時可選擇同時還原成本設定、費率與修改紀錄。一次最多 25 MB、100,000 筆，格式錯誤時不寫入資料。

## Cloudflare 雲端版（自動同步）

密碼登入、Magnific 官方 MCP 授權、定時自動同步，同事用檢視密碼唯讀。部署見 [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)。

## 本機開發

Node.js 22.13 以上：

```sh
npm ci
npm run dev:pages
```

預覽網址：`http://127.0.0.1:5174/EMC-Magnific/`

```sh
npm test
npx tsc --noEmit
npm run build:pages
```

靜態產物位於 `dist-pages/`，GitHub 子路徑由 `vite.pages.config.ts` 設定。

## 部署

`.github/workflows/pages.yml` 在推送至 `main` 時執行測試、型別檢查及靜態建置，再部署至 GitHub Pages。PR 只驗證，不部署。儲存庫的 Pages 發布來源須設定為 GitHub Actions。

## 原伺服器版本

`app/api/`、`lib/tracker/provider.ts`、`lib/tracker/sync.ts`、資料庫遷移與原部署設定一併保留。此版本依賴 Sites 的 ChatGPT 身分、Magnific 連接及 Cloudflare D1；不能僅靠 GitHub Pages 執行。細節見 [伺服器版本說明](docs/SITES_BACKEND.md)。

GitHub Pages 入口 `pages/main.tsx` 與原版共用介面、資料型別及計點規則，透過 `browser-api.ts` 將讀寫切換到本機帳本。實際創作明細、金鑰與本機資料庫不包含在公開儲存庫。
