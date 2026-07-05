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
