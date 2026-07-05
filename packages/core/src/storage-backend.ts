import type { Platform } from "./schema.js";

export interface UploadRequest {
  filePath: string;
  title: string;
  privacy: "unlisted" | "private";
  description?: string;
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
