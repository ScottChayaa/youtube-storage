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
