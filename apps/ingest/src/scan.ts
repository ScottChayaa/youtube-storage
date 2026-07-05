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
