# Phase 1 · Plan 2 — YouTube 上傳 + Drive 主索引同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `pnpm publish <資料夾>` 指令：把 ingest 產生的投影片影片上傳到 YouTube（不公開）、回填索引、把「時間戳說明」寫進影片描述，並把該資料夾的索引**併入使用者 Google Drive 的一份主索引**；冪等、可續傳。

**Architecture:** 新增 `@app/publish` 應用。Google API 以介面（`YouTubeApi`/`DriveApi`）抽象化並注入，純邏輯（ID 生成、索引合併、描述文字、上傳/續傳決策）以 TDD 完整覆蓋；真正的 OAuth、`googleapis` 呼叫屬薄轉接層，以手動整合驗證。索引 ID 改為全域唯一，Drive 上維護單一 `master-index.json`（append-only 合併）。

**Tech Stack:** TypeScript (ESM/NodeNext)、Node ≥20、pnpm、Vitest、`googleapis`、`google-auth-library`、既有 `@app/core`/`@app/ingest`。

## Global Constraints

- 沿用 Plan 1 全部約束：ESM、`NodeNext`、相對 import 帶 `.js`、`strict`、`verbatimModuleSyntax`（type-only 用 `import type`）、Vitest、pnpm workspace、索引欄位 camelCase、`Platform` enum 只有 `"youtube"`。
- **Commit 訊息不得含 `Co-Authored-By` trailer。**
- 新套件命名 `@app/publish`；對 `@app/core` 相依用 `"@app/core": "workspace:*"`。
- 新依賴：`googleapis`、`google-auth-library`（裝在 `@app/publish`）。
- **索引 ID 全域唯一**：`eventId = evt_<year>_<MM>_<eventKey>`，`eventKey` = `sha1(eventName)` 前 8 碼十六進位；`videoId = <eventId>_slideshow`；`segmentId = <eventId>_seg_<NNNN>`。
- **Drive 主索引**：檔名 `master-index.json`，存於 Drive `appDataFolder` 空間；合併為 append-or-replace（依 `id`）。
- **OAuth scopes**：`https://www.googleapis.com/auth/youtube.upload`、`https://www.googleapis.com/auth/drive.appdata`。桌面 loopback 流程；憑證與 token 存 `${XDG_CONFIG_HOME:-~/.config}/youtube-storage/`（`credentials.json`、`token.json`）。
- **冪等**：只上傳 `platformVideoId === null` 的影片；每上傳一支立即存回本機 `index.json`，可續傳。
- **配額**：偵測 `quotaExceeded`/`uploadLimitExceeded` → 拋 `QuotaExceededError`；orchestration 捕捉後保存進度並提示隔天續傳。
- **本版範圍限制（明確不做）**：只處理 `type: "slideshow"` 影片（原始短片 clip 以原樣上傳留待後續計畫）；`YouTubeBackend.download`（還原）不透過 Data API 實作，暫拋明確錯誤（yt-dlp 為未來項目）；YouTube 原生「章節」需每段 ≥10 秒且 ≥3 段，投影片每張 4 秒多不符合，故描述僅寫「時間戳說明文字」（人可讀＋我方索引為主，跳轉靠 `?t=`），符合資格時同一文字也充當章節。

---

## File Structure

```
youtube-storage/
├── packages/core/src/
│   ├── merge-index.ts        (新) mergeIndex 純函式
│   ├── schema.ts             (改) 不動
│   ├── storage-backend.ts    (改) UploadRequest 增 optional description
│   └── index.ts              (改) 匯出 merge-index
├── apps/ingest/src/
│   ├── id.ts                 (新) eventKey
│   ├── indexer.ts            (改) 用全域唯一 ID；BuildIndexInput 移除 slideshowVideoId
│   └── cli.ts                (改) 不再傳 slideshowVideoId
└── apps/publish/            (新) @app/publish
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── clients.ts        介面 YouTubeApi/DriveApi + QuotaExceededError
    │   ├── youtube-backend.ts YouTubeBackend implements StorageBackend
    │   ├── description.ts    buildDescription（時間戳說明文字）
    │   ├── drive-index.ts    syncToDrive（讀主索引→合併→寫回）
    │   ├── publish.ts        runPublish（orchestration、冪等、續傳）
    │   ├── auth.ts           config 路徑、token 讀寫、OAuth2 loopback
    │   ├── google-clients.ts realYouTubeApi/realDriveApi（googleapis 轉接）
    │   └── cli.ts            進入點：接真 client → runPublish
    └── test/ …
```

---

### Task 1: `@app/ingest` — 全域唯一穩定 ID

**Files:**
- Create: `apps/ingest/src/id.ts`
- Modify: `apps/ingest/src/indexer.ts`, `apps/ingest/src/cli.ts`
- Test: `apps/ingest/test/id.test.ts`, update `apps/ingest/test/indexer.test.ts`

**Interfaces:**
- Produces: `eventKey(eventName: string): string`（sha1 前 8 碼）。`BuildIndexInput` **移除** `slideshowVideoId`。`buildIndex` 產出的 `eventId = evt_<year>_<MM>_<eventKey>`、`videoId = <eventId>_slideshow`、`segmentId = <eventId>_seg_<NNNN>`。

- [ ] **Step 1: 寫 `id.ts` 的失敗測試**

`apps/ingest/test/id.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { eventKey } from "../src/id.js";

describe("eventKey", () => {
  it("對同一名稱穩定、8 碼十六進位", () => {
    const k = eventKey("2025-07 游泳");
    expect(k).toMatch(/^[0-9a-f]{8}$/);
    expect(eventKey("2025-07 游泳")).toBe(k);
  });
  it("不同名稱得到不同 key", () => {
    expect(eventKey("2025-07 游泳")).not.toBe(eventKey("2025-07 生日"));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/ingest test id`
Expected: FAIL — Cannot find module `../src/id.js`。

- [ ] **Step 3: 實作 `id.ts`**

```ts
import { createHash } from "node:crypto";

export function eventKey(eventName: string): string {
  return createHash("sha1").update(eventName).digest("hex").slice(0, 8);
}
```

- [ ] **Step 4: 改 `indexer.ts` 使用唯一 ID**

把 `BuildIndexInput` 的 `slideshowVideoId: string;` 一行**刪除**，並將 `buildIndex` 內 id 相關段落改為（其餘不變）：
```ts
import { createEmptyIndex, type Index, type Platform } from "@app/core";
import { eventKey } from "./id.js";
// … 型別 imports 不變 …

export function buildIndex(input: BuildIndexInput, now: Date = new Date()): Index {
  const idx = createEmptyIndex(now);
  const platform: Platform = "youtube";
  const eventId = `evt_${input.year}_${String(input.month).padStart(2, "0")}_${eventKey(input.eventName)}`;
  const videoId = `${eventId}_slideshow`;

  idx.events.push({ id: eventId, name: input.eventName, year: input.year, month: input.month });

  idx.videos.push({
    id: videoId, platform, platformVideoId: null, type: "slideshow",
    title: input.eventName, durationSec: input.slideshowDurationSec,
    uploadDate: null, sourceBatch: input.sourceBatch,
  });

  input.photos.forEach((p, i) => {
    idx.segments.push({
      id: `${eventId}_seg_${String(i + 1).padStart(4, "0")}`,
      eventId, videoId, platform, platformVideoId: null,
      startSec: p.timing.startSec, endSec: p.timing.endSec,
      sourceFile: p.file.path, thumbnail: null, tags: p.tags,
      date: p.meta.date, gps: p.meta.gps,
    });
  });
  return idx;
}
```

- [ ] **Step 5: 改 `cli.ts`（移除 slideshowVideoId 傳入）**

在 `apps/ingest/src/cli.ts` 的 `buildIndex({ … })` 呼叫中，**刪除** `slideshowVideoId: "vid_slideshow_1",` 這一行。其餘不變。

- [ ] **Step 6: 更新 `indexer.test.ts` 期望值**

把 `apps/ingest/test/indexer.test.ts` 中：
- `import` 區加上一行：`import { eventKey } from "../src/id.js";`
- 輸入物件裡**刪除** `slideshowVideoId: "vid_slideshow_1",`。
- 期望值改為：
```ts
const eventId = `evt_2025_07_${eventKey("2025-07 游泳")}`;
expect(idx.events[0].id).toBe(eventId);
expect(idx.videos[0].id).toBe(`${eventId}_slideshow`);
expect(idx.segments[0].eventId).toBe(eventId);
expect(idx.segments[0].videoId).toBe(`${eventId}_slideshow`);
expect(idx.segments[0].id).toBe(`${eventId}_seg_0001`);
```
（保留原本對 `startSec/endSec/gps/長度` 等斷言。）

- [ ] **Step 7: 跑測試確認全通過**

Run: `pnpm --filter @app/ingest test`
Expected: PASS（含 id、indexer、cli 全綠）。

- [ ] **Step 8: Commit**

```bash
git add apps/ingest/src/id.ts apps/ingest/src/indexer.ts apps/ingest/src/cli.ts apps/ingest/test/id.test.ts apps/ingest/test/indexer.test.ts
git commit -m "feat(ingest): 索引改用全域唯一穩定 ID（供跨資料夾合併）"
```

---

### Task 2: `@app/core` — mergeIndex + UploadRequest.description

**Files:**
- Create: `packages/core/src/merge-index.ts`
- Modify: `packages/core/src/storage-backend.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/merge-index.test.ts`

**Interfaces:**
- Produces: `mergeIndex(master: Index, incoming: Index, now?: Date): Index`（依 `id` append-or-replace events/videos/segments；`incoming` 覆蓋同 id；`updatedAt` = now）。`UploadRequest` 新增 `description?: string`。

- [ ] **Step 1: 寫失敗測試**

`packages/core/test/merge-index.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mergeIndex, createEmptyIndex, IndexSchema, type Index } from "../src/index.js";

function idx(partial: Partial<Index>): Index {
  return { ...createEmptyIndex(new Date("2026-01-01T00:00:00Z")), ...partial };
}
const ev = (id: string) => ({ id, name: id, year: 2025, month: 7 });
const vid = (id: string) => ({ id, platform: "youtube" as const, platformVideoId: null, type: "slideshow" as const, title: id, durationSec: 4, uploadDate: null, sourceBatch: "x/" });

describe("mergeIndex", () => {
  it("聯集不同 id 的項目", () => {
    const a = idx({ events: [ev("e1")], videos: [vid("v1")] });
    const b = idx({ events: [ev("e2")], videos: [vid("v2")] });
    const m = mergeIndex(a, b, new Date("2026-07-05T00:00:00Z"));
    expect(m.events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(m.videos.map((v) => v.id).sort()).toEqual(["v1", "v2"]);
    expect(m.updatedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(() => IndexSchema.parse(m)).not.toThrow();
  });
  it("同 id 時 incoming 覆蓋 master", () => {
    const a = idx({ videos: [{ ...vid("v1"), platformVideoId: null }] });
    const b = idx({ videos: [{ ...vid("v1"), platformVideoId: "yt123" }] });
    const m = mergeIndex(a, b);
    expect(m.videos).toHaveLength(1);
    expect(m.videos[0].platformVideoId).toBe("yt123");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/core test merge-index`
Expected: FAIL — `mergeIndex` 未匯出。

- [ ] **Step 3: 實作 `merge-index.ts`**

```ts
import { type Index } from "./schema.js";

function upsertById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const map = new Map<string, T>(base.map((x) => [x.id, x]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

export function mergeIndex(master: Index, incoming: Index, now: Date = new Date()): Index {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    events: upsertById(master.events, incoming.events),
    videos: upsertById(master.videos, incoming.videos),
    segments: upsertById(master.segments, incoming.segments),
  };
}
```

- [ ] **Step 4: 擴充 `UploadRequest` 與 barrel**

`storage-backend.ts` 的 `UploadRequest` 增一欄：
```ts
export interface UploadRequest {
  filePath: string;
  title: string;
  privacy: "unlisted" | "private";
  description?: string;
}
```
`index.ts` 加：`export * from "./merge-index.js";`

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm --filter @app/core test`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/merge-index.ts packages/core/src/storage-backend.ts packages/core/src/index.ts packages/core/test/merge-index.test.ts
git commit -m "feat(core): 新增 mergeIndex 與 UploadRequest.description"
```

---

### Task 3: `@app/publish` 套件 + 描述文字產生

**Files:**
- Create: `apps/publish/package.json`, `apps/publish/tsconfig.json`, `apps/publish/src/description.ts`
- Test: `apps/publish/test/description.test.ts`

**Interfaces:**
- Produces: `buildDescription(index: Index, videoId: string): string`（該影片的 segments 依 `startSec` 排序，每行 `m:ss <caption 或 tags 以空白連接>`）。

- [ ] **Step 1: 建立 `@app/publish` 套件外殼**

`apps/publish/package.json`:
```json
{
  "name": "@app/publish",
  "version": "0.0.0",
  "type": "module",
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run", "start": "tsx src/cli.ts" },
  "dependencies": {
    "@app/core": "workspace:*",
    "googleapis": "^144.0.0",
    "google-auth-library": "^9.14.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0", "vitest": "^2.0.0", "tsx": "^4.16.0", "@types/node": "^20.14.0"
  }
}
```

`apps/publish/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: 寫失敗測試**

`apps/publish/test/description.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createEmptyIndex, type Index } from "@app/core";
import { buildDescription } from "../src/description.js";

function make(): Index {
  const idx = createEmptyIndex(new Date("2026-01-01T00:00:00Z"));
  const base = { eventId: "e", videoId: "v", platform: "youtube" as const, platformVideoId: null, sourceFile: "x", thumbnail: null, date: null, gps: null };
  idx.segments.push({ ...base, id: "s2", startSec: 185, endSec: 189, tags: ["游泳"], caption: "下水" });
  idx.segments.push({ ...base, id: "s1", startSec: 0, endSec: 4, tags: ["2025", "游泳"] });
  idx.segments.push({ ...base, id: "sx", videoId: "other", startSec: 8, endSec: 12, tags: ["別支"] });
  return idx;
}

describe("buildDescription", () => {
  it("只取該影片、依時間排序、用 caption 優先否則 tags", () => {
    expect(buildDescription(make(), "v")).toBe("0:00 2025 游泳\n3:05 下水");
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm --filter @app/publish test description`（若首次需先 `pnpm install`）
Expected: FAIL — Cannot find module `../src/description.js`。

- [ ] **Step 4: 實作 `description.ts`**

```ts
import { type Index } from "@app/core";

function fmt(sec: number): string {
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildDescription(index: Index, videoId: string): string {
  return index.segments
    .filter((s) => s.videoId === videoId)
    .sort((a, b) => a.startSec - b.startSec)
    .map((s) => `${fmt(s.startSec)} ${s.caption ?? s.tags.join(" ")}`.trim())
    .join("\n");
}
```

- [ ] **Step 5: 安裝 + 跑測試確認通過**

Run: `pnpm install && pnpm --filter @app/publish test description`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/publish/package.json apps/publish/tsconfig.json apps/publish/src/description.ts apps/publish/test/description.test.ts pnpm-lock.yaml
git commit -m "feat(publish): 建立 @app/publish 與描述時間戳文字產生"
```

---

### Task 4: 用戶端介面 + YouTubeBackend

**Files:**
- Create: `apps/publish/src/clients.ts`, `apps/publish/src/youtube-backend.ts`
- Test: `apps/publish/test/youtube-backend.test.ts`

**Interfaces:**
- Produces:
  - `InsertVideoInput { filePath: string; title: string; description: string; privacyStatus: "unlisted" | "private" }`
  - `interface YouTubeApi { insertVideo(input: InsertVideoInput): Promise<{ id: string }> }`
  - `interface DriveApi { findFile(name): Promise<string|null>; readFile(fileId): Promise<string>; createFile(name, content): Promise<string>; updateFile(fileId, content): Promise<void> }`
  - `class QuotaExceededError extends Error`
  - `class YouTubeBackend implements StorageBackend`（建構子注入 `YouTubeApi`）。
- Consumes: `StorageBackend`/`UploadRequest`/`UploadResult`/`Platform`/`youtubeDeepLink`（`@app/core`）。

- [ ] **Step 1: 寫失敗測試**

`apps/publish/test/youtube-backend.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { YouTubeBackend } from "../src/youtube-backend.js";
import type { YouTubeApi } from "../src/clients.js";

describe("YouTubeBackend", () => {
  it("upload 透傳 description/title/privacy，回傳 platformVideoId", async () => {
    const insertVideo = vi.fn().mockResolvedValue({ id: "yt_abc" });
    const api: YouTubeApi = { insertVideo };
    const backend = new YouTubeBackend(api);
    const res = await backend.upload({ filePath: "/f/slideshow.mp4", title: "2025-07 游泳", privacy: "unlisted", description: "0:00 游泳" });
    expect(res).toEqual({ platform: "youtube", platformVideoId: "yt_abc", durationSec: 0 });
    expect(insertVideo).toHaveBeenCalledWith({ filePath: "/f/slideshow.mp4", title: "2025-07 游泳", description: "0:00 游泳", privacyStatus: "unlisted" });
  });
  it("deepLink 產生帶時間戳連結", () => {
    expect(new YouTubeBackend({ insertVideo: vi.fn() }).deepLink("abc", 185)).toBe("https://www.youtube.com/watch?v=abc&t=185s");
  });
  it("download 目前明確不支援", async () => {
    await expect(new YouTubeBackend({ insertVideo: vi.fn() }).download("abc", "/tmp/x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/publish test youtube-backend`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 `clients.ts`**

```ts
export interface InsertVideoInput {
  filePath: string;
  title: string;
  description: string;
  privacyStatus: "unlisted" | "private";
}

export interface YouTubeApi {
  insertVideo(input: InsertVideoInput): Promise<{ id: string }>;
}

export interface DriveApi {
  findFile(name: string): Promise<string | null>;
  readFile(fileId: string): Promise<string>;
  createFile(name: string, content: string): Promise<string>;
  updateFile(fileId: string, content: string): Promise<void>;
}

export class QuotaExceededError extends Error {
  constructor(message = "YouTube 上傳配額已用盡") {
    super(message);
    this.name = "QuotaExceededError";
  }
}
```

- [ ] **Step 4: 實作 `youtube-backend.ts`**

```ts
import {
  youtubeDeepLink,
  type StorageBackend,
  type UploadRequest,
  type UploadResult,
  type Platform,
} from "@app/core";
import type { YouTubeApi } from "./clients.js";

export class YouTubeBackend implements StorageBackend {
  readonly platform: Platform = "youtube";
  constructor(private readonly api: YouTubeApi) {}

  async upload(req: UploadRequest): Promise<UploadResult> {
    const { id } = await this.api.insertVideo({
      filePath: req.filePath,
      title: req.title,
      description: req.description ?? "",
      privacyStatus: req.privacy,
    });
    return { platform: "youtube", platformVideoId: id, durationSec: 0 };
  }

  deepLink(platformVideoId: string, sec: number): string {
    return youtubeDeepLink(platformVideoId, sec);
  }

  async download(_platformVideoId: string, _destPath: string): Promise<void> {
    throw new Error("YouTube 下載未透過 Data API 支援（還原以 yt-dlp 為未來項目）");
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm --filter @app/publish test youtube-backend`
Expected: PASS（3 passed）。

- [ ] **Step 6: Commit**

```bash
git add apps/publish/src/clients.ts apps/publish/src/youtube-backend.ts apps/publish/test/youtube-backend.test.ts
git commit -m "feat(publish): 用戶端介面與 YouTubeBackend"
```

---

### Task 5: Drive 主索引同步

**Files:**
- Create: `apps/publish/src/drive-index.ts`
- Test: `apps/publish/test/drive-index.test.ts`

**Interfaces:**
- Produces: `syncToDrive(drive: DriveApi, incoming: Index, now?: Date): Promise<Index>`（找 `master-index.json`：無則以空索引起始，有則讀出並 `IndexSchema.parse`；`mergeIndex` 後，無則 `createFile`、有則 `updateFile`；回傳合併後索引）。
- Consumes: `DriveApi`（Task 4）；`mergeIndex`/`createEmptyIndex`/`IndexSchema`/`Index`（`@app/core`）。

- [ ] **Step 1: 寫失敗測試**

`apps/publish/test/drive-index.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createEmptyIndex, IndexSchema, type Index } from "@app/core";
import { syncToDrive } from "../src/drive-index.js";
import type { DriveApi } from "../src/clients.js";

const vid = (id: string, pv: string | null) => ({ id, platform: "youtube" as const, platformVideoId: pv, type: "slideshow" as const, title: id, durationSec: 4, uploadDate: null, sourceBatch: "x/" });
function incoming(): Index { const i = createEmptyIndex(); i.videos.push(vid("v1", "yt1")); return i; }

describe("syncToDrive", () => {
  it("主索引不存在 → createFile 寫入合併結果", async () => {
    const drive: DriveApi = { findFile: vi.fn().mockResolvedValue(null), readFile: vi.fn(), createFile: vi.fn().mockResolvedValue("newid"), updateFile: vi.fn() };
    const merged = await syncToDrive(drive, incoming(), new Date("2026-07-05T00:00:00Z"));
    expect(drive.createFile).toHaveBeenCalledTimes(1);
    const [name, content] = (drive.createFile as any).mock.calls[0];
    expect(name).toBe("master-index.json");
    expect(() => IndexSchema.parse(JSON.parse(content))).not.toThrow();
    expect(merged.videos.map((v) => v.id)).toEqual(["v1"]);
  });
  it("主索引已存在 → 讀出、合併、updateFile", async () => {
    const existing = createEmptyIndex(); existing.videos.push(vid("v0", "yt0"));
    const drive: DriveApi = { findFile: vi.fn().mockResolvedValue("fid"), readFile: vi.fn().mockResolvedValue(JSON.stringify(existing)), createFile: vi.fn(), updateFile: vi.fn().mockResolvedValue(undefined) };
    const merged = await syncToDrive(drive, incoming());
    expect(drive.updateFile).toHaveBeenCalledTimes(1);
    expect(merged.videos.map((v) => v.id).sort()).toEqual(["v0", "v1"]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/publish test drive-index`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 `drive-index.ts`**

```ts
import { mergeIndex, createEmptyIndex, IndexSchema, type Index } from "@app/core";
import type { DriveApi } from "./clients.js";

export const MASTER_INDEX_NAME = "master-index.json";

export async function syncToDrive(drive: DriveApi, incoming: Index, now: Date = new Date()): Promise<Index> {
  const fileId = await drive.findFile(MASTER_INDEX_NAME);
  const master: Index = fileId
    ? IndexSchema.parse(JSON.parse(await drive.readFile(fileId)))
    : createEmptyIndex(now);
  const merged = mergeIndex(master, incoming, now);
  const content = JSON.stringify(merged, null, 2);
  if (fileId) await drive.updateFile(fileId, content);
  else await drive.createFile(MASTER_INDEX_NAME, content);
  return merged;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/publish test drive-index`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add apps/publish/src/drive-index.ts apps/publish/test/drive-index.test.ts
git commit -m "feat(publish): Drive 主索引讀取-合併-寫回同步"
```

---

### Task 6: 上傳協調 runPublish（冪等、續傳、配額）

**Files:**
- Create: `apps/publish/src/publish.ts`
- Test: `apps/publish/test/publish.test.ts`

**Interfaces:**
- Produces:
  - `PublishDeps { backend: YouTubeBackend; drive: DriveApi; now?: () => Date }`
  - `runPublish(folder: string, deps: PublishDeps): Promise<{ uploaded: number; index: Index }>`
- 行為：讀 `<folder>/index.json`（`IndexSchema.parse`）；對每支 `type==="slideshow"` 且 `platformVideoId===null` 的影片：以 `<folder>/slideshow.mp4` 為檔、`buildDescription` 為描述呼叫 `backend.upload`，回填該影片與其 segments 的 `platformVideoId`、影片 `uploadDate`；**每支上傳後立即寫回 `index.json`**。捕捉 `QuotaExceededError` → 保存進度後拋出可讀的「請隔天續傳」訊息。全部完成後 `syncToDrive`。非 slideshow 影片略過。
- Consumes: `YouTubeBackend`、`DriveApi`、`QuotaExceededError`（Task 4）；`buildDescription`（Task 3）；`syncToDrive`（Task 5）；`IndexSchema`/`Index`（core）。

- [ ] **Step 1: 寫失敗測試**

`apps/publish/test/publish.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyIndex, IndexSchema, type Index } from "@app/core";
import { runPublish } from "../src/publish.js";
import { YouTubeBackend } from "../src/youtube-backend.js";
import { QuotaExceededError, type DriveApi } from "../src/clients.js";

function fakeDrive(): DriveApi {
  return { findFile: vi.fn().mockResolvedValue(null), readFile: vi.fn(), createFile: vi.fn().mockResolvedValue("fid"), updateFile: vi.fn() };
}
function indexWith(pv: string | null): Index {
  const i = createEmptyIndex();
  i.videos.push({ id: "e_slideshow", platform: "youtube", platformVideoId: pv, type: "slideshow", title: "T", durationSec: 4, uploadDate: null, sourceBatch: "x/" });
  i.segments.push({ id: "e_seg_0001", eventId: "e", videoId: "e_slideshow", platform: "youtube", platformVideoId: pv, startSec: 0, endSec: 4, sourceFile: "x", thumbnail: null, tags: ["游泳"], date: null, gps: null });
  return i;
}

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "pub-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("runPublish", () => {
  it("上傳未上傳影片、回填 index、寫回檔案、同步 Drive", async () => {
    await writeFile(join(dir, "index.json"), JSON.stringify(indexWith(null)), "utf8");
    const insertVideo = vi.fn().mockResolvedValue({ id: "yt_1" });
    const drive = fakeDrive();
    const res = await runPublish(dir, { backend: new YouTubeBackend({ insertVideo }), drive, now: () => new Date("2026-07-05T00:00:00Z") });

    expect(res.uploaded).toBe(1);
    expect(insertVideo).toHaveBeenCalledOnce();
    const saved = IndexSchema.parse(JSON.parse(await readFile(join(dir, "index.json"), "utf8")));
    expect(saved.videos[0].platformVideoId).toBe("yt_1");
    expect(saved.videos[0].uploadDate).toBe("2026-07-05");
    expect(saved.segments[0].platformVideoId).toBe("yt_1");
    expect(drive.createFile).toHaveBeenCalledOnce();
  });

  it("已上傳影片略過（冪等）", async () => {
    await writeFile(join(dir, "index.json"), JSON.stringify(indexWith("yt_old")), "utf8");
    const insertVideo = vi.fn();
    await runPublish(dir, { backend: new YouTubeBackend({ insertVideo }), drive: fakeDrive() });
    expect(insertVideo).not.toHaveBeenCalled();
  });

  it("配額錯誤 → 保存進度並丟出可續傳訊息", async () => {
    await writeFile(join(dir, "index.json"), JSON.stringify(indexWith(null)), "utf8");
    const insertVideo = vi.fn().mockRejectedValue(new QuotaExceededError());
    await expect(
      runPublish(dir, { backend: new YouTubeBackend({ insertVideo }), drive: fakeDrive() }),
    ).rejects.toThrow(/續傳/);
    const saved = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    expect(saved.videos[0].platformVideoId).toBeNull(); // 這支沒成功，仍為 null
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/publish test publish`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 `publish.ts`**

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IndexSchema, type Index } from "@app/core";
import { QuotaExceededError, type DriveApi } from "./clients.js";
import { YouTubeBackend } from "./youtube-backend.js";
import { buildDescription } from "./description.js";
import { syncToDrive } from "./drive-index.js";

export interface PublishDeps {
  backend: YouTubeBackend;
  drive: DriveApi;
  now?: () => Date;
}

export async function runPublish(
  folder: string,
  deps: PublishDeps,
): Promise<{ uploaded: number; index: Index }> {
  const now = deps.now ?? (() => new Date());
  const indexPath = join(folder, "index.json");
  const index: Index = IndexSchema.parse(JSON.parse(await readFile(indexPath, "utf8")));

  let uploaded = 0;
  for (const video of index.videos) {
    if (video.type !== "slideshow") continue; // clip 以原樣上傳留待後續計畫
    if (video.platformVideoId !== null) continue; // 冪等：已上傳略過
    const filePath = join(folder, "slideshow.mp4");
    const description = buildDescription(index, video.id);
    try {
      const res = await deps.backend.upload({ filePath, title: video.title, privacy: "unlisted", description });
      video.platformVideoId = res.platformVideoId;
      video.uploadDate = now().toISOString().slice(0, 10);
      for (const seg of index.segments) {
        if (seg.videoId === video.id) seg.platformVideoId = res.platformVideoId;
      }
      uploaded++;
      await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8"); // 每支上傳後即存，可續傳
    } catch (err) {
      await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8"); // 保存已完成的進度
      if (err instanceof QuotaExceededError) {
        throw new Error(`已達 YouTube 上傳配額（本次成功 ${uploaded} 支）。已上傳部分已保存，請隔天重跑同資料夾續傳。`);
      }
      throw err;
    }
  }

  await syncToDrive(deps.drive, index, now());
  return { uploaded, index };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/publish test publish`
Expected: PASS（3 passed）。

- [ ] **Step 5: 跑整包測試**

Run: `pnpm test`
Expected: 全部套件 PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/publish/src/publish.ts apps/publish/test/publish.test.ts
git commit -m "feat(publish): runPublish 上傳協調（冪等、續傳、配額）"
```

---

### Task 7: OAuth 授權（loopback）+ token 持久化 + GCP 設定文件

**Files:**
- Create: `apps/publish/src/auth.ts`, `docs/superpowers/plans/plan2-google-setup.md`
- Test: `apps/publish/test/auth.test.ts`

**Interfaces:**
- Produces（可單元測試部分）：`configDir(env?)`, `tokenPath(env?)`, `credentialsPath(env?)`, `loadJson<T>(path): Promise<T|null>`, `saveJson(path, data): Promise<void>`, `SCOPES: string[]`。
- Produces（整合、手動驗證）：`getAuthClient(): Promise<OAuth2Client>`（有 token 就載入；否則跑 loopback 授權並存 token）。

> 說明：`getAuthClient` 的互動 loopback 需要真實瀏覽器與 GCP 憑證，屬**手動整合驗證**；單元測試只覆蓋 config 路徑解析與 token 讀寫 round-trip。

- [ ] **Step 1: 寫失敗測試（純路徑 + 讀寫）**

`apps/publish/test/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configDir, tokenPath, loadJson, saveJson, SCOPES } from "../src/auth.js";

describe("auth config", () => {
  it("以 XDG_CONFIG_HOME 決定設定目錄", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/x/cfg" } as NodeJS.ProcessEnv)).toBe("/x/cfg/youtube-storage");
    expect(tokenPath({ XDG_CONFIG_HOME: "/x/cfg" } as NodeJS.ProcessEnv)).toBe("/x/cfg/youtube-storage/token.json");
  });
  it("SCOPES 含 youtube.upload 與 drive.appdata", () => {
    expect(SCOPES).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(SCOPES).toContain("https://www.googleapis.com/auth/drive.appdata");
  });
});

describe("json 讀寫", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "auth-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
  it("saveJson 後 loadJson 取回相同物件；缺檔回 null", async () => {
    const p = join(dir, "sub", "token.json");
    await saveJson(p, { refresh_token: "r" });
    expect(await loadJson(p)).toEqual({ refresh_token: "r" });
    expect(await loadJson(join(dir, "nope.json"))).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/publish test auth`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 `auth.ts`**

```ts
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/drive.appdata",
];

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "youtube-storage");
}
export function tokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "token.json");
}
export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "credentials.json");
}

export async function loadJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}
export async function saveJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

interface InstalledCreds {
  installed: { client_id: string; client_secret: string };
}

// 手動整合：需要 GCP 憑證與瀏覽器。單元測試不涵蓋此函式。
export async function getAuthClient(env: NodeJS.ProcessEnv = process.env): Promise<OAuth2Client> {
  const creds = await loadJson<InstalledCreds>(credentialsPath(env));
  if (!creds) {
    throw new Error(`找不到 ${credentialsPath(env)}，請依 docs/superpowers/plans/plan2-google-setup.md 建立桌面 OAuth 憑證`);
  }
  const { client_id, client_secret } = creds.installed;

  const saved = await loadJson<Record<string, unknown>>(tokenPath(env));
  if (saved) {
    const client = new google.auth.OAuth2(client_id, client_secret);
    client.setCredentials(saved);
    return client;
  }

  // Loopback：起臨時本機伺服器接收授權碼
  // 注意：port 只在 listen callback 取一次並建立唯一 client；
  // 不可在 server.close() 之後呼叫 server.address()（會回 null）。
  return await new Promise<OAuth2Client>((resolve, reject) => {
    let client: OAuth2Client | undefined;
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "", "http://127.0.0.1");
        const code = url.searchParams.get("code");
        if (!code) { res.end("等待授權碼…"); return; }
        res.end("授權完成，可關閉此分頁。");
        if (!client) { server.close(); reject(new Error("OAuth client 尚未初始化")); return; }
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        await saveJson(tokenPath(env), tokens);
        server.close();
        resolve(client);
      } catch (e) {
        reject(e);
      }
    });
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      client = new google.auth.OAuth2(client_id, client_secret, `http://127.0.0.1:${port}`);
      const authUrl = client.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });
      console.log(`請在瀏覽器開啟並授權：\n${authUrl}`);
    });
  });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/publish test auth`
Expected: PASS（config 與讀寫測試）。

- [ ] **Step 5: 撰寫 GCP 設定文件**

`docs/superpowers/plans/plan2-google-setup.md`（內容）：
```markdown
# Plan 2 — Google Cloud / OAuth 設定

1. 到 Google Cloud Console 建立一個專案。
2. 「API 和服務 → 程式庫」啟用 **YouTube Data API v3** 與 **Google Drive API**。
3. 「OAuth 同意畫面」：使用者類型選「外部」，發布狀態維持「測試中」，把自己的 Google 帳號加入「測試使用者」（日後給親友時同樣加入，≤100 人）。
4. 「憑證 → 建立憑證 → OAuth 用戶端 ID」：應用程式類型選 **桌面應用程式**。下載 JSON。
5. 把下載的 JSON 存成 `~/.config/youtube-storage/credentials.json`（其內為 `{ "installed": { "client_id": "...", "client_secret": "...", ... } }`）。
6. 首次執行 `pnpm publish <資料夾>` 會印出授權網址；在瀏覽器登入/同意後（會出現「未驗證應用程式」警告，按繼續），token 會存到 `~/.config/youtube-storage/token.json`，之後免再授權。
```

- [ ] **Step 6: Commit**

```bash
git add apps/publish/src/auth.ts apps/publish/test/auth.test.ts docs/superpowers/plans/plan2-google-setup.md
git commit -m "feat(publish): OAuth loopback 授權、token 持久化與 GCP 設定文件"
```

---

### Task 8: 真實 Google 轉接層 + publish CLI（整合）

**Files:**
- Create: `apps/publish/src/google-clients.ts`, `apps/publish/src/cli.ts`
- Test: `apps/publish/test/google-clients.test.ts`

**Interfaces:**
- Produces:
  - `realYouTubeApi(auth: OAuth2Client): YouTubeApi`（`youtube.videos.insert`，`part:["snippet","status"]`，`media.body = createReadStream(filePath)`；把 `quotaExceeded`/`uploadLimitExceeded` 轉為 `QuotaExceededError`）。
  - `realDriveApi(auth: OAuth2Client): DriveApi`（`appDataFolder` 空間；`files.list`/`files.get(alt:"media")`/`files.create(parents:["appDataFolder"])`/`files.update`）。
  - CLI 進入點：`getAuthClient()` → 真 client → `YouTubeBackend` → `runPublish(folder)`。

> 說明：真實 googleapis 呼叫需網路與 OAuth，屬**手動整合驗證**。單元測試只覆蓋「錯誤 → QuotaExceededError 轉換」這段純邏輯（把假的 `youtube` 客戶端注入）。實作前可用 context7 查證 `googleapis` 當前簽章。

- [ ] **Step 1: 寫失敗測試（配額錯誤轉換）**

`apps/publish/test/google-clients.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { QuotaExceededError } from "../src/clients.js";
import { mapInsertError } from "../src/google-clients.js";

describe("mapInsertError", () => {
  it("quotaExceeded / uploadLimitExceeded → QuotaExceededError", () => {
    const e1 = { errors: [{ reason: "quotaExceeded" }] };
    const e2 = { response: { data: { error: { errors: [{ reason: "uploadLimitExceeded" }] } } } };
    expect(mapInsertError(e1)).toBeInstanceOf(QuotaExceededError);
    expect(mapInsertError(e2)).toBeInstanceOf(QuotaExceededError);
  });
  it("其他錯誤原樣回傳", () => {
    const e = new Error("boom");
    expect(mapInsertError(e)).toBe(e);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/publish test google-clients`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 `google-clients.ts`**

```ts
import { google } from "googleapis";
import { createReadStream } from "node:fs";
import type { OAuth2Client } from "google-auth-library";
import { QuotaExceededError, type YouTubeApi, type DriveApi, type InsertVideoInput } from "./clients.js";

export function mapInsertError(err: unknown): unknown {
  const anyErr = err as { errors?: { reason?: string }[]; response?: { data?: { error?: { errors?: { reason?: string }[] } } } };
  const reason =
    anyErr?.errors?.[0]?.reason ??
    anyErr?.response?.data?.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "uploadLimitExceeded") {
    return new QuotaExceededError();
  }
  return err;
}

export function realYouTubeApi(auth: OAuth2Client): YouTubeApi {
  const yt = google.youtube({ version: "v3", auth });
  return {
    async insertVideo(input: InsertVideoInput) {
      try {
        const res = await yt.videos.insert({
          part: ["snippet", "status"],
          requestBody: {
            snippet: { title: input.title, description: input.description },
            status: { privacyStatus: input.privacyStatus },
          },
          media: { body: createReadStream(input.filePath) },
        });
        return { id: res.data.id! };
      } catch (err) {
        throw mapInsertError(err);
      }
    },
  };
}

export function realDriveApi(auth: OAuth2Client): DriveApi {
  const drive = google.drive({ version: "v3", auth });
  return {
    async findFile(name) {
      const res = await drive.files.list({
        spaces: "appDataFolder",
        q: `name='${name}'`,
        fields: "files(id,name)",
      });
      return res.data.files?.[0]?.id ?? null;
    },
    async readFile(fileId) {
      const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
      return res.data as unknown as string;
    },
    async createFile(name, content) {
      const res = await drive.files.create({
        requestBody: { name, parents: ["appDataFolder"] },
        media: { mimeType: "application/json", body: content },
        fields: "id",
      });
      return res.data.id!;
    },
    async updateFile(fileId, content) {
      await drive.files.update({ fileId, media: { mimeType: "application/json", body: content } });
    },
  };
}
```

- [ ] **Step 4: 實作 `cli.ts`**

```ts
import { getAuthClient } from "./auth.js";
import { realYouTubeApi, realDriveApi } from "./google-clients.js";
import { YouTubeBackend } from "./youtube-backend.js";
import { runPublish } from "./publish.js";

export async function main(folder: string): Promise<void> {
  const auth = await getAuthClient();
  const backend = new YouTubeBackend(realYouTubeApi(auth));
  const drive = realDriveApi(auth);
  const res = await runPublish(folder, { backend, drive });
  console.log(`完成：本次上傳 ${res.uploaded} 支，已同步 Drive 主索引。`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("用法: publish <資料夾路徑>");
    process.exit(1);
  }
  main(folder).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: 加 root script + 跑測試**

在 root `package.json` 的 `scripts` 加一行：
```json
"publish": "pnpm --filter @app/publish exec tsx src/cli.ts"
```
Run: `pnpm --filter @app/publish test google-clients` → PASS；再 `pnpm test` → 全綠。

- [ ] **Step 6:（手動整合驗證，需 GCP 憑證 + ffmpeg 產生的 slideshow.mp4）**

依 `plan2-google-setup.md` 設好 `credentials.json` 後，在一個已 `pnpm ingest` 過（有 `slideshow.mp4` + `index.json`）的資料夾執行：
```bash
pnpm publish "/path/to/2025-07 游泳"
```
Expected：首次跳授權 → 影片出現在 YouTube（不公開）、描述含時間戳、`index.json` 的 `platformVideoId` 已回填、Drive `appDataFolder` 出現 `master-index.json`。（對應驗收 V2.1–V2.5、V2.6 配額。）若無憑證/網路則略過此步。

- [ ] **Step 7: Commit**

```bash
git add apps/publish/src/google-clients.ts apps/publish/src/cli.ts package.json apps/publish/test/google-clients.test.ts
git commit -m "feat(publish): googleapis 轉接層與 publish CLI 串接"
```

---

## 完成後（Plan 2 產出）

- `pnpm publish "<資料夾>"`：把投影片上傳 YouTube（不公開）、回填索引、寫描述時間戳、併入 Drive 主索引；冪等可續傳。
- 對應驗收清單 **V2.1–V2.7**（V2.7 還原標記為未實作/未來）。

## 後續計畫銜接（不在本計畫範圍）

- **原始短片 clip 以原樣上傳**：擴充 ingest 產生 `type:"clip"` 影片項與 segment、publish 依各自 `localPath` 上傳。
- **縮圖生成**（Plan 3 前置）：ingest 產生 base64 縮圖寫入索引。
- **Plan 3**：Nuxt 檢索 PWA（Google 登入 PKCE → 讀 Drive `master-index.json` → 搜尋 + 首頁瀏覽 → `youtubeDeepLink` 跳轉）。
- **還原（download）**：以 yt-dlp 實作 `YouTubeBackend.download`。
