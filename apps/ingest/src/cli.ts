import { writeFile, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { IndexSchema } from "@app/core";
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

  if (photos.length === 0) {
    throw new Error(`資料夾內沒有照片可處理: ${folder}`);
  }
  if (year === 0 || month === 0) {
    throw new Error(`資料夾名需以 YYYY-MM 開頭: ${folderName}`);
  }

  const timings = computeTimings(photos.map((p) => p.path), DEFAULT_SLIDESHOW);
  const slideshowPath = join(folder, "slideshow.mp4");
  const concatPath = join(folder, ".slideshow-concat.txt");
  try {
    await writeFile(concatPath, buildConcatFile(timings), "utf8");
    await runFfmpeg(
      buildFfmpegArgs(concatPath, slideshowPath, DEFAULT_SLIDESHOW),
      opts.runner,
    );
  } finally {
    await rm(concatPath, { force: true });
  }

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
      slideshowDurationSec: totalDurationSec(timings),
      sourceBatch: `${folderName}/`,
      photos: photoInputs,
    },
    opts.now,
  );

  IndexSchema.parse(index);

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
