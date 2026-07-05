import { describe, it, expect } from "vitest";
import { createEmptyIndex, type Index } from "@app/core";
import { buildDescription } from "../src/description.js";

function make(): Index {
  const idx = createEmptyIndex(new Date("2026-01-01T00:00:00Z"));
  const base = { eventId: "e", videoId: "v", platform: "youtube" as const, platformVideoId: null, sourceFile: "x", thumbnail: null, date: null, gps: null };
  idx.segments.push({ ...base, id: "s2", startSec: 185, endSec: 189, tags: ["游泳"], caption: "下水" });
  idx.segments.push({ ...base, id: "s1", startSec: 0, endSec: 4, tags: ["2025", "游泳"] });
  idx.segments.push({ ...base, id: "sx", videoId: "other", startSec: 8, endSec: 12, tags: ["別支"] });
  return idx;
}

describe("buildDescription", () => {
  it("只取該影片、依時間排序、用 caption 優先否則 tags", () => {
    expect(buildDescription(make(), "v")).toBe("0:00 2025 游泳\n3:05 下水");
  });
});
