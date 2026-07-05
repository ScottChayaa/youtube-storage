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
