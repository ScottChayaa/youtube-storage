# Phase 1 · Plan 1 — Monorepo Core + 離線 CLI 匯入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Turborepo monorepo 與共用 `@app/core`，並做出一個**完全離線**的 CLI：掃描一個 `年-月` 資料夾 → 從 EXIF 自動產生 tag → 用 ffmpeg 把照片合成投影片影片 → 產出本機 `index.json`。

**Architecture:** pnpm workspace + Turborepo。`packages/core` 定義索引 schema（zod）與儲存後端介面（純型別/純函式，可離線測試）。`apps/ingest` 是 Node CLI，把「掃描 → 讀 metadata → 合成投影片 → 組索引」串成管線。這一份計畫不接觸任何 Google API，所有邏輯以純函式為主、副作用（ffmpeg、fs）以可注入的方式隔離，方便 TDD。

**Tech Stack:** TypeScript (ESM, NodeNext)、Node ≥ 20、pnpm、Turborepo、Vitest、tsx、zod、exifr、系統 ffmpeg。

## Global Constraints

- Node 版本：**≥ 20**（使用內建 `node:test` 無關；測試用 Vitest）。
- 套件管理器：**pnpm**（workspace 由 `pnpm-workspace.yaml` 定義）。
- 模組系統：**ESM**，`tsconfig` 用 `"module": "NodeNext"`、`"moduleResolution": "NodeNext"`；所有相對 import **帶 `.js` 副檔名**。
- TypeScript：`"strict": true`。
- 套件命名：共用套件 `@app/core`；CLI 應用 `@app/ingest`；跨套件相依用 workspace 協定 `"@app/core": "workspace:*"`。
- 索引欄位命名一律 **camelCase**（`platformVideoId`、`videoId`、`startSec`…）；序列化後的 `index.json` 亦為 camelCase。
- 平台列舉目前僅 `"youtube"`（見 §3.1 of spec；抽象層預留）。
- Commit 訊息**不得**包含 `Co-Authored-By` trailer（使用者規範）。
- 每個 segment 的 `platformVideoId` 在「尚未上傳」時為 `null`（上傳在 Plan 2 才會填）。

---

## File Structure

```
youtube-storage/                     (既有 repo，已含 docs/、git)
├── package.json                     (root：workspaces + turbo scripts)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── vitest.workspace.ts
├── packages/
│   └── core/                        @app/core — 共用 schema 與介面
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── schema.ts            索引 zod schema + 型別 + createEmptyIndex
│       │   ├── storage-backend.ts   StorageBackend 介面 + youtubeDeepLink
│       │   └── index.ts             barrel export
│       └── test/
│           ├── schema.test.ts
│           └── storage-backend.test.ts
└── apps/
    └── ingest/                      @app/ingest — 離線匯入 CLI
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── scan.ts              掃描資料夾 → MediaFile[]
        │   ├── metadata.ts          EXIF 讀取 + deriveTags
        │   ├── slideshow.ts         computeTimings / buildConcatFile / buildFfmpegArgs
        │   ├── ffmpeg.ts            runFfmpeg（可注入 runner）
        │   ├── indexer.ts           buildIndex
        │   └── cli.ts               進入點：串起整條管線
        └── test/
            ├── scan.test.ts
            ├── metadata.test.ts
            ├── slideshow.test.ts
            ├── ffmpeg.test.ts
            ├── indexer.test.ts
            └── cli.test.ts
```

---

### Task 1: Monorepo 骨架 + `@app/core` 索引 schema

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `vitest.workspace.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/schema.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/schema.test.ts`

**Interfaces:**
- Produces: `Index`, `EventEntry`, `VideoEntry`, `SegmentEntry`, `Platform`（zod schema + 對應型別）；`createEmptyIndex(now?: Date): Index`；`IndexSchema`（可 `.parse()`）。

- [ ] **Step 1: 建立 workspace 設定檔**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

root `package.json`:
```json
{
  "name": "youtube-storage",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "ingest": "pnpm --filter @app/ingest exec tsx src/cli.ts"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "@types/node": "^20.14.0"
  }
}
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.workspace.ts`:
```ts
export default ["packages/*", "apps/*"];
```

- [ ] **Step 2: 建立 `@app/core` 套件外殼**

`packages/core/package.json`:
```json
{
  "name": "@app/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: 寫失敗的測試**

`packages/core/test/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { IndexSchema, createEmptyIndex } from "../src/index.js";

describe("index schema", () => {
  it("createEmptyIndex 產生可通過驗證的空索引", () => {
    const idx = createEmptyIndex(new Date("2026-07-05T00:00:00Z"));
    expect(idx.version).toBe(1);
    expect(idx.events).toEqual([]);
    expect(() => IndexSchema.parse(idx)).not.toThrow();
  });

  it("拒絕缺少必填欄位的 segment", () => {
    const bad = { ...createEmptyIndex(), segments: [{ id: "seg_1" }] };
    expect(() => IndexSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 4: 安裝相依並跑測試確認失敗**

Run: `pnpm install && pnpm --filter @app/core test`
Expected: FAIL —「Cannot find module '../src/index.js'」（尚未實作）。

- [ ] **Step 5: 實作 schema**

`packages/core/src/schema.ts`:
```ts
import { z } from "zod";

export const Platform = z.enum(["youtube"]);
export type Platform = z.infer<typeof Platform>;

export const EventEntry = z.object({
  id: z.string(),
  name: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  location: z.string().optional(),
});
export type EventEntry = z.infer<typeof EventEntry>;

export const VideoEntry = z.object({
  id: z.string(),
  platform: Platform,
  platformVideoId: z.string().nullable(),
  type: z.enum(["slideshow", "clip"]),
  title: z.string(),
  durationSec: z.number().nonnegative(),
  uploadDate: z.string().nullable(),
  sourceBatch: z.string(),
});
export type VideoEntry = z.infer<typeof VideoEntry>;

export const SegmentEntry = z.object({
  id: z.string(),
  eventId: z.string(),
  videoId: z.string(),
  platform: Platform,
  platformVideoId: z.string().nullable(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  sourceFile: z.string(),
  thumbnail: z.string().nullable(),
  tags: z.array(z.string()),
  caption: z.string().optional(),
  date: z.string().nullable(),
  gps: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});
export type SegmentEntry = z.infer<typeof SegmentEntry>;

export const IndexSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  events: z.array(EventEntry),
  videos: z.array(VideoEntry),
  segments: z.array(SegmentEntry),
});
export type Index = z.infer<typeof IndexSchema>;

export function createEmptyIndex(now: Date = new Date()): Index {
  return { version: 1, updatedAt: now.toISOString(), events: [], videos: [], segments: [] };
}
```

`packages/core/src/index.ts`:
```ts
export * from "./schema.js";
export * from "./storage-backend.js";
```

> 注意：`index.ts` 匯出 `./storage-backend.js`，該檔在 Task 2 建立。本 Task 先建立一個最小佔位以免編譯失敗——在 Step 5 一併建立空的 `storage-backend.ts`：
```ts
// packages/core/src/storage-backend.ts （Task 2 會填內容）
export {};
```

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm --filter @app/core test`
Expected: PASS（2 passed）。

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.workspace.ts packages/core pnpm-lock.yaml
git commit -m "feat(core): 建立 monorepo 骨架與索引 zod schema"
```

---

### Task 2: `@app/core` 儲存後端介面 + `youtubeDeepLink`

**Files:**
- Modify: `packages/core/src/storage-backend.ts`
- Test: `packages/core/test/storage-backend.test.ts`

**Interfaces:**
- Consumes: `Platform`（Task 1）。
- Produces: `StorageBackend` 介面（`platform`、`upload`、`download`、`deepLink`）；`UploadRequest`、`UploadResult` 型別；`youtubeDeepLink(platformVideoId: string, sec: number): string`。

- [ ] **Step 1: 寫失敗的測試**

`packages/core/test/storage-backend.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { youtubeDeepLink } from "../src/index.js";

describe("youtubeDeepLink", () => {
  it("產生帶時間戳的觀看連結", () => {
    expect(youtubeDeepLink("abc123", 185)).toBe(
      "https://www.youtube.com/watch?v=abc123&t=185s"
    );
  });
  it("秒數無條件捨去為非負整數", () => {
    expect(youtubeDeepLink("x", 12.9)).toBe("https://www.youtube.com/watch?v=x&t=12s");
    expect(youtubeDeepLink("x", -5)).toBe("https://www.youtube.com/watch?v=x&t=0s");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/core test storage-backend`
Expected: FAIL —「youtubeDeepLink is not exported」。

- [ ] **Step 3: 實作介面與函式**

`packages/core/src/storage-backend.ts`（覆蓋 Task 1 的佔位）:
```ts
import type { Platform } from "./schema.js";

export interface UploadRequest {
  filePath: string;
  title: string;
  privacy: "unlisted" | "private";
}

export interface UploadResult {
  platform: Platform;
  platformVideoId: string;
  durationSec: number;
}

export interface StorageBackend {
  readonly platform: Platform;
  upload(req: UploadRequest): Promise<UploadResult>;
  download(platformVideoId: string, destPath: string): Promise<void>;
  deepLink(platformVideoId: string, sec: number): string;
}

export function youtubeDeepLink(platformVideoId: string, sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  return `https://www.youtube.com/watch?v=${platformVideoId}&t=${t}s`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/core test`
Expected: PASS（全部）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/storage-backend.ts packages/core/test/storage-backend.test.ts
git commit -m "feat(core): 新增 StorageBackend 介面與 youtubeDeepLink 解析器"
```

---

### Task 3: `@app/ingest` — 掃描資料夾

**Files:**
- Create: `apps/ingest/package.json`, `apps/ingest/tsconfig.json`, `apps/ingest/src/scan.ts`
- Test: `apps/ingest/test/scan.test.ts`

**Interfaces:**
- Produces: `MediaKind = "photo" | "video"`；`MediaFile { path: string; name: string; kind: MediaKind }`；`classify(ext: string): MediaKind | null`；`scanDirectory(dir: string): Promise<MediaFile[]>`（依檔名排序、忽略非媒體與子目錄）。

- [ ] **Step 1: 建立 `@app/ingest` 套件外殼**

`apps/ingest/package.json`:
```json
{
  "name": "@app/ingest",
  "version": "0.0.0",
  "type": "module",
  "bin": { "ingest": "src/cli.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "start": "tsx src/cli.ts"
  },
  "dependencies": {
    "@app/core": "workspace:*",
    "exifr": "^7.1.3"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "@types/node": "^20.14.0"
  }
}
```

`apps/ingest/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 2: 寫失敗的測試**

`apps/ingest/test/scan.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, scanDirectory } from "../src/scan.js";

describe("classify", () => {
  it("依副檔名判斷型別，不分大小寫", () => {
    expect(classify(".JPG")).toBe("photo");
    expect(classify(".mp4")).toBe("video");
    expect(classify(".txt")).toBeNull();
  });
});

describe("scanDirectory", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scan-"));
    await writeFile(join(dir, "b.jpg"), "x");
    await writeFile(join(dir, "a.mp4"), "x");
    await writeFile(join(dir, "note.txt"), "x");
    await mkdir(join(dir, "sub"));
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("只回傳媒體檔、忽略子目錄、依檔名排序", async () => {
    const files = await scanDirectory(dir);
    expect(files.map((f) => f.name)).toEqual(["a.mp4", "b.jpg"]);
    expect(files[0].kind).toBe("video");
    expect(files[1].kind).toBe("photo");
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm install && pnpm --filter @app/ingest test scan`
Expected: FAIL —「Cannot find module '../src/scan.js'」。

- [ ] **Step 4: 實作 scan**

`apps/ingest/src/scan.ts`:
```ts
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";

export type MediaKind = "photo" | "video";

export interface MediaFile {
  path: string;
  name: string;
  kind: MediaKind;
}

const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv"]);

export function classify(ext: string): MediaKind | null {
  const e = ext.toLowerCase();
  if (PHOTO_EXT.has(e)) return "photo";
  if (VIDEO_EXT.has(e)) return "video";
  return null;
}

export async function scanDirectory(dir: string): Promise<MediaFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: MediaFile[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const kind = classify(extname(ent.name));
    if (!kind) continue;
    out.push({ path: join(dir, ent.name), name: ent.name, kind });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm --filter @app/ingest test scan`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/ingest/package.json apps/ingest/tsconfig.json apps/ingest/src/scan.ts apps/ingest/test/scan.test.ts pnpm-lock.yaml
git commit -m "feat(ingest): 新增資料夾掃描與媒體分類"
```

---

### Task 4: `@app/ingest` — EXIF metadata 與 deriveTags

**Files:**
- Create: `apps/ingest/src/metadata.ts`
- Test: `apps/ingest/test/metadata.test.ts`

**Interfaces:**
- Produces: `MediaMeta { date: string | null; gps: { lat: number; lng: number } | null }`；`readMeta(filePath: string): Promise<MediaMeta>`（用 exifr，失敗時回 `{date:null,gps:null}`）；`deriveTags(meta: MediaMeta, folderName: string): string[]`（純函式：年、`N月`、資料夾名 token；去重）。

- [ ] **Step 1: 寫失敗的測試**

`apps/ingest/test/metadata.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { deriveTags, readMeta } from "../src/metadata.js";

describe("deriveTags", () => {
  it("由日期產生年/月 tag，並拆解資料夾名", () => {
    const tags = deriveTags({ date: "2025-07-12", gps: null }, "2025-07 游泳");
    expect(tags).toContain("2025");
    expect(tags).toContain("7月");
    expect(tags).toContain("游泳");
  });
  it("無日期時只用資料夾 token，且結果去重", () => {
    const tags = deriveTags({ date: null, gps: null }, "海邊_海邊");
    expect(tags).toEqual(["海邊"]);
  });
});

describe("readMeta", () => {
  it("解析 exifr 的日期與 GPS", async () => {
    vi.resetModules();
    vi.doMock("exifr", () => ({
      default: { parse: vi.fn().mockResolvedValue({
        DateTimeOriginal: new Date("2025-07-12T09:00:00Z"),
        latitude: 24.7, longitude: 121.74,
      }) },
    }));
    const { readMeta: read } = await import("../src/metadata.js");
    const meta = await read("/fake.jpg");
    expect(meta.date).toBe("2025-07-12");
    expect(meta.gps).toEqual({ lat: 24.7, lng: 121.74 });
  });

  it("exifr 失敗時回傳全 null，不拋錯", async () => {
    vi.resetModules();
    vi.doMock("exifr", () => ({ default: { parse: vi.fn().mockRejectedValue(new Error("bad")) } }));
    const { readMeta: read } = await import("../src/metadata.js");
    expect(await read("/fake.jpg")).toEqual({ date: null, gps: null });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/ingest test metadata`
Expected: FAIL —「Cannot find module '../src/metadata.js'」。

- [ ] **Step 3: 實作 metadata**

`apps/ingest/src/metadata.ts`:
```ts
import exifr from "exifr";

export interface MediaMeta {
  date: string | null;
  gps: { lat: number; lng: number } | null;
}

export async function readMeta(filePath: string): Promise<MediaMeta> {
  const data = await exifr.parse(filePath, { gps: true }).catch(() => null);
  const dt: Date | undefined = data?.DateTimeOriginal ?? data?.CreateDate;
  const date = dt instanceof Date ? dt.toISOString().slice(0, 10) : null;
  const gps =
    data && data.latitude != null && data.longitude != null
      ? { lat: data.latitude as number, lng: data.longitude as number }
      : null;
  return { date, gps };
}

export function deriveTags(meta: MediaMeta, folderName: string): string[] {
  const tags = new Set<string>();
  if (meta.date) {
    const [y, m] = meta.date.split("-");
    tags.add(y);
    tags.add(`${Number(m)}月`);
  }
  for (const tok of folderName.split(/[\s_\-/]+/).filter(Boolean)) tags.add(tok);
  return [...tags];
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/ingest test metadata`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest/src/metadata.ts apps/ingest/test/metadata.test.ts
git commit -m "feat(ingest): 新增 EXIF metadata 讀取與 tag 推導"
```

---

### Task 5: `@app/ingest` — 投影片時間軸與 ffmpeg 參數（純函式）

**Files:**
- Create: `apps/ingest/src/slideshow.ts`
- Test: `apps/ingest/test/slideshow.test.ts`

**Interfaces:**
- Produces:
  - `SlideshowOptions { secondsPerPhoto: number; width: number; height: number; fps: number }` 與 `DEFAULT_SLIDESHOW`（4 秒/張、3840×2160、30fps）。
  - `SlideTiming { sourceFile: string; startSec: number; endSec: number }`。
  - `computeTimings(photoPaths: string[], opts: SlideshowOptions): SlideTiming[]`。
  - `buildConcatFile(timings: SlideTiming[]): string`（ffmpeg concat demuxer 格式）。
  - `buildFfmpegArgs(concatFilePath: string, outPath: string, opts: SlideshowOptions): string[]`。
  - `totalDurationSec(timings: SlideTiming[]): number`。

- [ ] **Step 1: 寫失敗的測試**

`apps/ingest/test/slideshow.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  computeTimings, buildConcatFile, buildFfmpegArgs, totalDurationSec, DEFAULT_SLIDESHOW,
} from "../src/slideshow.js";

const opts = { ...DEFAULT_SLIDESHOW, secondsPerPhoto: 4 };

describe("computeTimings", () => {
  it("每張照片依序配 4 秒區間", () => {
    const t = computeTimings(["/a.jpg", "/b.jpg"], opts);
    expect(t).toEqual([
      { sourceFile: "/a.jpg", startSec: 0, endSec: 4 },
      { sourceFile: "/b.jpg", startSec: 4, endSec: 8 },
    ]);
  });
});

describe("totalDurationSec", () => {
  it("回傳最後一段的 endSec", () => {
    expect(totalDurationSec(computeTimings(["/a.jpg", "/b.jpg"], opts))).toBe(8);
    expect(totalDurationSec([])).toBe(0);
  });
});

describe("buildConcatFile", () => {
  it("產生帶 duration 的 concat 內容，並重複最後一張", () => {
    const out = buildConcatFile(computeTimings(["/a.jpg"], opts));
    expect(out).toBe("file '/a.jpg'\nduration 4\nfile '/a.jpg'\n");
  });
});

describe("buildFfmpegArgs", () => {
  it("包含 concat 輸入、縮放與 libx264 輸出", () => {
    const args = buildFfmpegArgs("/tmp/list.txt", "/tmp/out.mp4", opts);
    expect(args).toContain("/tmp/list.txt");
    expect(args).toContain("/tmp/out.mp4");
    expect(args).toContain("libx264");
    expect(args.join(" ")).toContain("scale=3840:2160");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/ingest test slideshow`
Expected: FAIL —「Cannot find module '../src/slideshow.js'」。

- [ ] **Step 3: 實作 slideshow**

`apps/ingest/src/slideshow.ts`:
```ts
export interface SlideshowOptions {
  secondsPerPhoto: number;
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_SLIDESHOW: SlideshowOptions = {
  secondsPerPhoto: 4,
  width: 3840,
  height: 2160,
  fps: 30,
};

export interface SlideTiming {
  sourceFile: string;
  startSec: number;
  endSec: number;
}

export function computeTimings(photoPaths: string[], opts: SlideshowOptions): SlideTiming[] {
  return photoPaths.map((p, i) => ({
    sourceFile: p,
    startSec: i * opts.secondsPerPhoto,
    endSec: (i + 1) * opts.secondsPerPhoto,
  }));
}

export function totalDurationSec(timings: SlideTiming[]): number {
  return timings.length ? timings[timings.length - 1].endSec : 0;
}

function quote(path: string): string {
  return path.replace(/'/g, "'\\''");
}

export function buildConcatFile(timings: SlideTiming[]): string {
  const lines: string[] = [];
  for (const t of timings) {
    lines.push(`file '${quote(t.sourceFile)}'`);
    lines.push(`duration ${t.endSec - t.startSec}`);
  }
  if (timings.length) lines.push(`file '${quote(timings[timings.length - 1].sourceFile)}'`);
  return lines.join("\n") + "\n";
}

export function buildFfmpegArgs(
  concatFilePath: string,
  outPath: string,
  opts: SlideshowOptions,
): string[] {
  const scale =
    `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,` +
    `pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`;
  return [
    "-y",
    "-f", "concat", "-safe", "0", "-i", concatFilePath,
    "-vf", `${scale},fps=${opts.fps}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(opts.fps),
    outPath,
  ];
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/ingest test slideshow`
Expected: PASS（4 passed）。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest/src/slideshow.ts apps/ingest/test/slideshow.test.ts
git commit -m "feat(ingest): 新增投影片時間軸與 ffmpeg 參數建構"
```

---

### Task 6: `@app/ingest` — ffmpeg 執行包裝（可注入 runner）

**Files:**
- Create: `apps/ingest/src/ffmpeg.ts`
- Test: `apps/ingest/test/ffmpeg.test.ts`

**Interfaces:**
- Produces: `Runner = (cmd: string, args: string[]) => Promise<void>`；`realRunner: Runner`（`spawn`，非 0 退出即 reject）；`runFfmpeg(args: string[], runner?: Runner): Promise<void>`（預設用 `realRunner`，以 `"ffmpeg"` 為命令）。

- [ ] **Step 1: 寫失敗的測試**

`apps/ingest/test/ffmpeg.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runFfmpeg } from "../src/ffmpeg.js";

describe("runFfmpeg", () => {
  it("用注入的 runner 以 ffmpeg 命令與傳入參數呼叫", async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    await runFfmpeg(["-y", "out.mp4"], runner);
    expect(runner).toHaveBeenCalledWith("ffmpeg", ["-y", "out.mp4"]);
  });

  it("runner 失敗時向外拋出", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(runFfmpeg([], runner)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/ingest test ffmpeg`
Expected: FAIL —「Cannot find module '../src/ffmpeg.js'」。

- [ ] **Step 3: 實作 ffmpeg 包裝**

`apps/ingest/src/ffmpeg.ts`:
```ts
import { spawn } from "node:child_process";

export type Runner = (cmd: string, args: string[]) => Promise<void>;

export const realRunner: Runner = (cmd, args) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });

export async function runFfmpeg(args: string[], runner: Runner = realRunner): Promise<void> {
  await runner("ffmpeg", args);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/ingest test ffmpeg`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest/src/ffmpeg.ts apps/ingest/test/ffmpeg.test.ts
git commit -m "feat(ingest): 新增可注入 runner 的 ffmpeg 執行包裝"
```

---

### Task 7: `@app/ingest` — 組裝索引 `buildIndex`

**Files:**
- Create: `apps/ingest/src/indexer.ts`
- Test: `apps/ingest/test/indexer.test.ts`

**Interfaces:**
- Consumes: `Index`, `createEmptyIndex`, `Platform`（`@app/core`）；`MediaFile`（scan）；`SlideTiming`（slideshow）；`MediaMeta`（metadata）。
- Produces:
  - `PhotoEntryInput { file: MediaFile; meta: MediaMeta; tags: string[]; timing: SlideTiming }`。
  - `BuildIndexInput { eventName: string; year: number; month: number; slideshowVideoId: string; slideshowDurationSec: number; sourceBatch: string; photos: PhotoEntryInput[] }`。
  - `buildIndex(input: BuildIndexInput, now?: Date): Index`（產出 1 event + 1 slideshow video + 每張照片一個 segment；`platformVideoId`、`uploadDate`、`thumbnail` 皆 `null`）。

- [ ] **Step 1: 寫失敗的測試**

`apps/ingest/test/indexer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { IndexSchema } from "@app/core";
import { buildIndex } from "../src/indexer.js";
import type { BuildIndexInput } from "../src/indexer.js";

const input: BuildIndexInput = {
  eventName: "2025-07 游泳",
  year: 2025,
  month: 7,
  slideshowVideoId: "vid_slideshow_1",
  slideshowDurationSec: 8,
  sourceBatch: "2025-07/游泳/",
  photos: [
    {
      file: { path: "/2025-07/游泳/a.jpg", name: "a.jpg", kind: "photo" },
      meta: { date: "2025-07-12", gps: { lat: 24.7, lng: 121.74 } },
      tags: ["2025", "7月", "游泳"],
      timing: { sourceFile: "/2025-07/游泳/a.jpg", startSec: 0, endSec: 4 },
    },
    {
      file: { path: "/2025-07/游泳/b.jpg", name: "b.jpg", kind: "photo" },
      meta: { date: "2025-07-12", gps: null },
      tags: ["2025", "7月", "游泳"],
      timing: { sourceFile: "/2025-07/游泳/b.jpg", startSec: 4, endSec: 8 },
    },
  ],
};

describe("buildIndex", () => {
  it("產出通過 schema 驗證的索引", () => {
    const idx = buildIndex(input, new Date("2026-07-05T00:00:00Z"));
    expect(() => IndexSchema.parse(idx)).not.toThrow();
  });

  it("每張照片對應一個 segment，時間戳正確、尚未上傳為 null", () => {
    const idx = buildIndex(input);
    expect(idx.events).toHaveLength(1);
    expect(idx.videos).toHaveLength(1);
    expect(idx.segments).toHaveLength(2);
    expect(idx.videos[0].platformVideoId).toBeNull();
    expect(idx.segments[0].startSec).toBe(0);
    expect(idx.segments[1].endSec).toBe(8);
    expect(idx.segments[0].eventId).toBe("evt_2025_07");
    expect(idx.segments[0].videoId).toBe("vid_slideshow_1");
    expect(idx.segments[0].gps).toEqual({ lat: 24.7, lng: 121.74 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/ingest test indexer`
Expected: FAIL —「Cannot find module '../src/indexer.js'」。

- [ ] **Step 3: 實作 indexer**

`apps/ingest/src/indexer.ts`:
```ts
import { createEmptyIndex, type Index, type Platform } from "@app/core";
import type { MediaFile } from "./scan.js";
import type { SlideTiming } from "./slideshow.js";
import type { MediaMeta } from "./metadata.js";

export interface PhotoEntryInput {
  file: MediaFile;
  meta: MediaMeta;
  tags: string[];
  timing: SlideTiming;
}

export interface BuildIndexInput {
  eventName: string;
  year: number;
  month: number;
  slideshowVideoId: string;
  slideshowDurationSec: number;
  sourceBatch: string;
  photos: PhotoEntryInput[];
}

export function buildIndex(input: BuildIndexInput, now: Date = new Date()): Index {
  const idx = createEmptyIndex(now);
  const platform: Platform = "youtube";
  const eventId = `evt_${input.year}_${String(input.month).padStart(2, "0")}`;

  idx.events.push({
    id: eventId,
    name: input.eventName,
    year: input.year,
    month: input.month,
  });

  idx.videos.push({
    id: input.slideshowVideoId,
    platform,
    platformVideoId: null,
    type: "slideshow",
    title: input.eventName,
    durationSec: input.slideshowDurationSec,
    uploadDate: null,
    sourceBatch: input.sourceBatch,
  });

  input.photos.forEach((p, i) => {
    idx.segments.push({
      id: `seg_${String(i + 1).padStart(4, "0")}`,
      eventId,
      videoId: input.slideshowVideoId,
      platform,
      platformVideoId: null,
      startSec: p.timing.startSec,
      endSec: p.timing.endSec,
      sourceFile: p.file.path,
      thumbnail: null,
      tags: p.tags,
      date: p.meta.date,
      gps: p.meta.gps,
    });
  });

  return idx;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/ingest test indexer`
Expected: PASS（2 passed）。

- [ ] **Step 5: Commit**

```bash
git add apps/ingest/src/indexer.ts apps/ingest/test/indexer.test.ts
git commit -m "feat(ingest): 由掃描與時間軸組裝索引"
```

---

### Task 8: `@app/ingest` — CLI 串接與整合測試

**Files:**
- Create: `apps/ingest/src/cli.ts`
- Test: `apps/ingest/test/cli.test.ts`

**Interfaces:**
- Consumes: `scanDirectory`、`readMeta`、`deriveTags`、`computeTimings`/`buildConcatFile`/`buildFfmpegArgs`/`totalDurationSec`/`DEFAULT_SLIDESHOW`、`runFfmpeg`、`buildIndex`。
- Produces: `runIngest(folder: string, opts?: { runner?: Runner; now?: Date }): Promise<{ indexPath: string; slideshowPath: string }>`；CLI 進入點（讀 `process.argv[2]` 當資料夾）。
- 行為：輸出 `slideshow.mp4` 與 `index.json` 到「該資料夾內」；event 名稱與 `year/month` 由資料夾名推導（格式 `YYYY-MM...`，例 `2025-07 游泳` → year 2025、month 7、eventName 為完整資料夾名）。

- [ ] **Step 1: 寫失敗的測試（用注入 runner，不需真的 ffmpeg）**

`apps/ingest/test/cli.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IndexSchema } from "@app/core";
import { runIngest, parseFolderName } from "../src/cli.js";

describe("parseFolderName", () => {
  it("由 'YYYY-MM ...' 取出年月與事件名", () => {
    expect(parseFolderName("2025-07 游泳")).toEqual({
      year: 2025, month: 7, eventName: "2025-07 游泳",
    });
  });
  it("無法解析時 year/month 回退為 0", () => {
    expect(parseFolderName("misc")).toEqual({ year: 0, month: 0, eventName: "misc" });
  });
});

describe("runIngest", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "2025-07 游泳-"));
    await writeFile(join(dir, "a.jpg"), "x");
    await writeFile(join(dir, "b.jpg"), "x");
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("以假 runner 跑完管線，產生合法 index.json", async () => {
    let calledArgs: string[] = [];
    const runner = async (_cmd: string, args: string[]) => { calledArgs = args; };
    const res = await runIngest(dir, { runner, now: new Date("2026-07-05T00:00:00Z") });

    // ffmpeg 有被呼叫，且輸出路徑為 slideshow.mp4
    expect(calledArgs).toContain(join(dir, "slideshow.mp4"));

    const parsed = IndexSchema.parse(JSON.parse(await readFile(res.indexPath, "utf8")));
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.events[0].year).toBe(2025);
    expect(parsed.events[0].month).toBe(7);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm --filter @app/ingest test cli`
Expected: FAIL —「Cannot find module '../src/cli.js'」。

- [ ] **Step 3: 實作 CLI 串接**

`apps/ingest/src/cli.ts`:
```ts
import { writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { scanDirectory } from "./scan.js";
import { readMeta, deriveTags } from "./metadata.js";
import {
  computeTimings, buildConcatFile, buildFfmpegArgs, totalDurationSec, DEFAULT_SLIDESHOW,
} from "./slideshow.js";
import { runFfmpeg, type Runner } from "./ffmpeg.js";
import { buildIndex, type PhotoEntryInput } from "./indexer.js";

export function parseFolderName(name: string): { year: number; month: number; eventName: string } {
  const m = name.match(/^(\d{4})-(\d{2})/);
  return {
    year: m ? Number(m[1]) : 0,
    month: m ? Number(m[2]) : 0,
    eventName: name,
  };
}

export async function runIngest(
  folder: string,
  opts: { runner?: Runner; now?: Date } = {},
): Promise<{ indexPath: string; slideshowPath: string }> {
  const files = await scanDirectory(folder);
  const photos = files.filter((f) => f.kind === "photo");
  const folderName = basename(folder);
  const { year, month, eventName } = parseFolderName(folderName);

  const timings = computeTimings(photos.map((p) => p.path), DEFAULT_SLIDESHOW);
  const slideshowPath = join(folder, "slideshow.mp4");
  const concatPath = join(folder, ".slideshow-concat.txt");
  await writeFile(concatPath, buildConcatFile(timings), "utf8");
  await runFfmpeg(
    buildFfmpegArgs(concatPath, slideshowPath, DEFAULT_SLIDESHOW),
    opts.runner,
  );

  const photoInputs: PhotoEntryInput[] = [];
  for (let i = 0; i < photos.length; i++) {
    const meta = await readMeta(photos[i].path);
    photoInputs.push({
      file: photos[i],
      meta,
      tags: deriveTags(meta, folderName),
      timing: timings[i],
    });
  }

  const index = buildIndex(
    {
      eventName,
      year,
      month,
      slideshowVideoId: "vid_slideshow_1",
      slideshowDurationSec: totalDurationSec(timings),
      sourceBatch: `${folderName}/`,
      photos: photoInputs,
    },
    opts.now,
  );

  const indexPath = join(folder, "index.json");
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  return { indexPath, slideshowPath };
}

// CLI 進入點
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("用法: ingest <資料夾路徑>");
    process.exit(1);
  }
  runIngest(folder)
    .then((r) => console.log(`完成：\n  ${r.slideshowPath}\n  ${r.indexPath}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm --filter @app/ingest test cli`
Expected: PASS（3 passed）。

- [ ] **Step 5: 跑整個 monorepo 測試**

Run: `pnpm test`
Expected: 所有套件 PASS。

- [ ] **Step 6: （手動煙霧測試，需系統 ffmpeg）**

在一個含 2–3 張真實 `.jpg` 的資料夾執行：
```bash
pnpm ingest "/path/to/2025-07 游泳"
```
Expected: 該資料夾出現 `slideshow.mp4`（可播放）與 `index.json`（segments 對得上時間戳）。若無 ffmpeg，跳過此步。

- [ ] **Step 7: Commit**

```bash
git add apps/ingest/src/cli.ts apps/ingest/test/cli.test.ts
git commit -m "feat(ingest): 串接離線匯入 CLI 並輸出 slideshow 與 index.json"
```

---

## 完成後（Plan 1 產出）

- 可執行 `pnpm ingest "<年-月資料夾>"`，離線產出投影片影片與 `index.json`。
- `@app/core` 的 schema 與 `StorageBackend` 介面已就緒，供 Plan 2（YouTube 上傳 + Drive 同步）與 Plan 3（Nuxt 檢索 PWA）沿用。

## 後續計畫銜接（不在本計畫範圍）

- **Plan 2**：實作 `YouTubeBackend`（`upload`/`download`/`deepLink`）與 Drive 同步；把 `platformVideoId`、`uploadDate` 回填索引；處理 OAuth（desktop loopback）與**上傳配額（~6 支/日）**；把章節寫入 YouTube 描述。
- **Plan 3**：Nuxt + Tailwind PWA，Google 登入（PKCE）→ 讀 Drive 索引 → 關鍵字搜尋 segments → 縮圖牆 → `youtubeDeepLink` 跳轉。
