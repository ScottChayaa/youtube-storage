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
