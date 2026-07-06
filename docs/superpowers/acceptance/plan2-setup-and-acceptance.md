# Plan 2 — 安裝設定 · 執行流程 · 驗收步驟

- **對象**：`pnpm publish <資料夾>`（把 ingest 產生的投影片上傳 YouTube 不公開、回填索引、同步到 Google Drive 主索引）。
- **前置**：Plan 1 的 `pnpm ingest` 已能在該機器產生 `slideshow.mp4` + `index.json`。
- **相關文件**：GCP 憑證細節見 [plan2-google-setup.md](../plans/plan2-google-setup.md)；整體階段驗收見 [acceptance-checklist.md](acceptance-checklist.md)（本檔是 Plan 2 的操作版）。

---

## 一、安裝與環境需求

| 項目 | 需求 | 檢查指令 |
|---|---|---|
| Node | ≥ 20 | `node --version` |
| pnpm | 9/10 皆可 | `pnpm --version` |
| ffmpeg | 需安裝（ingest 合成投影片用） | `ffmpeg -version` |
| 相依套件 | 於 repo 根目錄安裝 | `pnpm install` |

- **安裝 ffmpeg**（擇一）：
  - Ubuntu/Debian：`sudo apt install ffmpeg`
  - macOS：`brew install ffmpeg`
  - Windows：`winget install Gyan.FFmpeg`（或 choco）

---

## 二、Google Cloud / OAuth 一次性設定

（完整步驟見 [plan2-google-setup.md](../plans/plan2-google-setup.md)，此處為摘要）

1. 建立 GCP 專案 → 啟用 **YouTube Data API v3** 與 **Google Drive API**。
2. 「OAuth 同意畫面」：使用者類型「外部」、狀態「測試中」，把自己的 Google 帳號加入**測試使用者**（日後給親友時同樣加入，上限 100 人）。
3. 「憑證 → OAuth 用戶端 ID → 桌面應用程式」，下載 JSON。
4. 把 JSON 存成：`~/.config/youtube-storage/credentials.json`
   （內容形如 `{ "installed": { "client_id": "...", "client_secret": "...", ... } }`）
5. 首次 `pnpm publish` 會印出授權網址；瀏覽器登入同意後（會出現「未驗證應用程式」警告，按繼續），token 自動存到 `~/.config/youtube-storage/token.json`，之後免再授權。

> **授權範圍（scopes）**：`youtube.upload` + `drive.appdata`。索引存在 Drive 的 App 專屬隱藏資料夾，不會出現在你的一般雲端硬碟清單中。

---

## 三、端到端執行流程

```bash
# 0. 一次性
pnpm install

# 1. 產生投影片 + 本機索引（Plan 1，需 ffmpeg）
pnpm ingest "/path/to/2025-07 游泳"
#   → 在該資料夾產生 slideshow.mp4 與 index.json

# 2. 上傳 + 同步 Drive（Plan 2，需 GCP 憑證；首次會跳授權）
pnpm publish "/path/to/2025-07 游泳"
#   → 上傳不公開影片、回填 index.json、寫入 Drive master-index.json
#   → 印出「完成：本次上傳 N 支，已同步 Drive 主索引。」
```

- **冪等**：`publish` 只會上傳 `index.json` 裡 `platformVideoId` 仍為 `null` 的影片。重跑不會重複上傳。
- **續傳**：撞到每日上傳配額時會停下並提示「請隔天重跑同資料夾續傳」；已上傳的進度已存回 `index.json`，隔天重跑接續即可。

---

## 四、驗收步驟（逐項勾選 + 記錄）

> 完成一項把 `- [ ]` 改成 `- [x]`，在「紀錄」填日期與結果（PASS/FAIL/備註）。

- [ ] **V2.1 不公開上傳**
  - 做法：`pnpm publish "<資料夾>"` 後，到 YouTube 工作室 → 內容，找到剛上傳的影片。
  - 預期：影片存在，瀏覽權限為「**不公開（Unlisted）**」。
  - 紀錄：

- [ ] **V2.2 索引回填**
  - 做法：打開該資料夾的 `index.json`。
  - 預期：對應影片的 `platformVideoId` 已是真實 YouTube ID（非 `null`）、`uploadDate` 已填；該影片的所有 segments 的 `platformVideoId` 也已回填。
  - 紀錄：

- [ ] **V2.3 深連結跳轉**
  - 做法：從 `index.json` 取某 segment 的 `platformVideoId` 與 `startSec`，開 `https://www.youtube.com/watch?v=<id>&t=<startSec>s`。
  - 預期：播放器直接跳到該秒數（對應那張照片/片段）。
  - 紀錄：

- [ ] **V2.4 描述時間戳**
  - 做法：看該影片的「說明（description）」。
  - 預期：描述含逐段時間戳文字（如 `0:00 2025 游泳` / `3:05 下水`）。
  - ⚠️ 註：YouTube「原生可點章節」需每段 ≥10 秒且 ≥3 段；投影片每張約 4 秒**不符合**，所以不會出現原生章節列——這是預期行為。時間戳文字仍在描述中作為人可讀備份，跳轉一律靠我們的索引 + `?t=`。
  - 紀錄：

- [ ] **V2.5 Drive 主索引同步**
  - 做法：因為 `master-index.json` 存在 Drive `appDataFolder`（一般介面看不到），用下列任一方式確認：
    - 再 `pnpm publish` 另一個資料夾，確認不報錯且「已同步」；或
    - 用 Drive API/OAuth Playground 以 `drive.appdata` 範圍列出 appDataFolder 檔案。
  - 預期：Drive appDataFolder 內存在 `master-index.json`，且包含多個資料夾累積的 events/videos/segments（append-only 合併，ID 不重複）。
  - 紀錄：

- [ ] **V2.6 配額韌性 / 冪等 / 續傳**
  - 做法：對同一個「已上傳完成」的資料夾再跑一次 `pnpm publish`。
  - 預期：不重複上傳（印出本次上傳 0 支），`index.json` 不變。
  - （選）若曾撞配額：確認有停下並提示續傳、且隔天重跑能接續上傳剩餘影片。
  - 紀錄：

- [ ] **V2.7 還原（下載回檔）——本版未實作**
  - 現況：`YouTubeBackend.download` 目前會拋出「未透過 Data API 支援」錯誤；還原（以 yt-dlp 取回壓縮版）列為未來項目。
  - 動作：本階段標記為 **N/A（延後）**，不需驗證。
  - 紀錄：延後

---

## 五、疑難排解

| 症狀 | 可能原因 / 處理 |
|---|---|
| 首次 `publish` 說找不到 `credentials.json` | 依第二節把桌面 OAuth JSON 放到 `~/.config/youtube-storage/credentials.json` |
| 授權頁出現「未驗證應用程式」 | 測試模式的正常現象，按「繼續」即可（你已是測試使用者） |
| 上傳到一半停下、提示配額 | 每日程式化上傳約 6 支上限；隔天重跑同資料夾即續傳（已上傳的不會重來） |
| `ingest` 產不出 `slideshow.mp4` | 確認 `ffmpeg -version` 可用；資料夾名需以 `YYYY-MM` 開頭且內含照片 |
| 影片描述沒有可點章節 | 預期行為（見 V2.4）；跳轉用索引 + `?t=`，不依賴原生章節 |

---

## 六、範圍備註（本版明確不做，非缺陷）

- 只上傳 `type:"slideshow"` 影片；原始短片 clip 以原樣上傳留待後續計畫。
- 縮圖延後到 Plan 3 前置。
- 還原（download）延後（yt-dlp）。
- 檢索/瀏覽介面是 Plan 3（Nuxt PWA）。
