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
