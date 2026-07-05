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
