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
