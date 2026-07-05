# Plan 2 — Google Cloud / OAuth 設定

1. 到 Google Cloud Console 建立一個專案。
2. 「API 和服務 → 程式庫」啟用 **YouTube Data API v3** 與 **Google Drive API**。
3. 「OAuth 同意畫面」：使用者類型選「外部」，發布狀態維持「測試中」，把自己的 Google 帳號加入「測試使用者」（日後給親友時同樣加入，≤100 人）。
4. 「憑證 → 建立憑證 → OAuth 用戶端 ID」：應用程式類型選 **桌面應用程式**。下載 JSON。
5. 把下載的 JSON 存成 `~/.config/youtube-storage/credentials.json`（其內為 `{ "installed": { "client_id": "...", "client_secret": "...", ... } }`）。
6. 首次執行 `pnpm publish <資料夾>` 會印出授權網址；在瀏覽器登入/同意後（會出現「未驗證應用程式」警告，按繼續），token 會存到 `~/.config/youtube-storage/token.json`，之後免再授權。
