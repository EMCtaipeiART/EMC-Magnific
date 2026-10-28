# Cloudflare 雲端版（密碼登入＋自動同步）

整個網站需要密碼才能開啟。後端是 Cloudflare Worker，資料存在 D1，透過 Magnific 官方 MCP 授權後由定時任務（每分鐘一次）分批自動同步。

## 角色
- **管理員密碼**（`ADMIN_PASSWORD`）：可連接 Magnific、同步、修改歸屬與費率。
- **檢視密碼**（`VIEW_PASSWORD`，選填）：給同事，唯讀。沒有設定時，同事只能用管理員密碼（不建議）。
- 密碼只存在 Cloudflare 的 secret，不會寫進程式碼或 GitHub。連續輸錯 5 次會鎖 5 分鐘。

## 部署（約 10 分鐘）
需要 Cloudflare 帳號與 Node.js 22 以上。

```sh
npm ci
npx wrangler login
npx wrangler d1 create emc-magnific
```
把輸出的 `database_id` 填進 `cloudflare/wrangler.jsonc`，然後：

```sh
npx wrangler d1 migrations apply emc-magnific --remote -c cloudflare/wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD -c cloudflare/wrangler.jsonc
npx wrangler secret put VIEW_PASSWORD -c cloudflare/wrangler.jsonc
npx wrangler secret put SESSION_SECRET -c cloudflare/wrangler.jsonc
npm run deploy:cf
```
部署完成會顯示網址（`https://emc-magnific.<帳號>.workers.dev`）。用管理員密碼登入 → 按「連接 Magnific」授權一次，之後自動同步歷史與新紀錄。

## 重要限制
- **建議使用 Workers Paid 方案（約 US$5／月）。** 每批同步會對 Magnific 與資料庫發出數十個請求，免費方案每次執行的請求數上限較低，可能中斷。
- 完整歷史同步約 800 批，分散在多次定時任務，預計數小時至半天；期間頁面頂端會顯示進度。之後每小時只補最近 3 天。
- Magnific 授權（含 refresh token）存在 D1，等同帳號權限；授權失效時頁面頂端會顯示錯誤，管理員重新按「連接 Magnific」即可，已存資料不受影響。
- 只呼叫唯讀工具，不會產生任何收費內容。

## 本機測試
```sh
printf 'ADMIN_PASSWORD=admin-test\nVIEW_PASSWORD=view-test\nSESSION_SECRET=local\n' > cloudflare/.dev.vars
npx wrangler d1 migrations apply emc-magnific --local -c cloudflare/wrangler.jsonc
npm run dev:cf
```
`.dev.vars` 已被 `.gitignore` 排除。
