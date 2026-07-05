import { describe, it, expect } from "vitest";
import { youtubeDeepLink } from "../src/index.js";

describe("youtubeDeepLink", () => {
  it("產生帶時間戳的觀看連結", () => {
    expect(youtubeDeepLink("abc123", 185)).toBe(
      "https://www.youtube.com/watch?v=abc123&t=185s"
    );
  });
  it("秒數無條件捨去為非負整數", () => {
    expect(youtubeDeepLink("x", 12.9)).toBe("https://www.youtube.com/watch?v=x&t=12s");
    expect(youtubeDeepLink("x", -5)).toBe("https://www.youtube.com/watch?v=x&t=0s");
  });
});
