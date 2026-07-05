import { describe, it, expect } from "vitest";
import { IndexSchema } from "@app/core";
import { buildIndex } from "../src/indexer.js";
import type { BuildIndexInput } from "../src/indexer.js";
import { eventKey } from "../src/id.js";

const input: BuildIndexInput = {
  eventName: "2025-07 游泳",
  year: 2025,
  month: 7,
  slideshowDurationSec: 8,
  sourceBatch: "2025-07/游泳/",
  photos: [
    {
      file: { path: "/2025-07/游泳/a.jpg", name: "a.jpg", kind: "photo" },
      meta: { date: "2025-07-12", gps: { lat: 24.7, lng: 121.74 } },
      tags: ["2025", "7月", "游泳"],
      timing: { sourceFile: "/2025-07/游泳/a.jpg", startSec: 0, endSec: 4 },
    },
    {
      file: { path: "/2025-07/游泳/b.jpg", name: "b.jpg", kind: "photo" },
      meta: { date: "2025-07-12", gps: null },
      tags: ["2025", "7月", "游泳"],
      timing: { sourceFile: "/2025-07/游泳/b.jpg", startSec: 4, endSec: 8 },
    },
  ],
};

describe("buildIndex", () => {
  it("產出通過 schema 驗證的索引", () => {
    const idx = buildIndex(input, new Date("2026-07-05T00:00:00Z"));
    expect(() => IndexSchema.parse(idx)).not.toThrow();
  });

  it("每張照片對應一個 segment，時間戳正確、尚未上傳為 null", () => {
    const idx = buildIndex(input);
    expect(idx.events).toHaveLength(1);
    expect(idx.videos).toHaveLength(1);
    expect(idx.segments).toHaveLength(2);
    expect(idx.videos[0].platformVideoId).toBeNull();
    expect(idx.segments[0].startSec).toBe(0);
    expect(idx.segments[1].endSec).toBe(8);
    const eventId = `evt_2025_07_${eventKey("2025-07 游泳")}`;
    expect(idx.events[0].id).toBe(eventId);
    expect(idx.videos[0].id).toBe(`${eventId}_slideshow`);
    expect(idx.segments[0].eventId).toBe(eventId);
    expect(idx.segments[0].videoId).toBe(`${eventId}_slideshow`);
    expect(idx.segments[0].id).toBe(`${eventId}_seg_0001`);
    expect(idx.segments[0].gps).toEqual({ lat: 24.7, lng: 121.74 });
  });
});
