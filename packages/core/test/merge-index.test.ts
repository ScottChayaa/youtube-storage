import { describe, it, expect } from "vitest";
import { mergeIndex, createEmptyIndex, IndexSchema, type Index } from "../src/index.js";

function idx(partial: Partial<Index>): Index {
  return { ...createEmptyIndex(new Date("2026-01-01T00:00:00Z")), ...partial };
}
const ev = (id: string) => ({ id, name: id, year: 2025, month: 7 });
const vid = (id: string) => ({ id, platform: "youtube" as const, platformVideoId: null, type: "slideshow" as const, title: id, durationSec: 4, uploadDate: null, sourceBatch: "x/" });

describe("mergeIndex", () => {
  it("聯集不同 id 的項目", () => {
    const a = idx({ events: [ev("e1")], videos: [vid("v1")] });
    const b = idx({ events: [ev("e2")], videos: [vid("v2")] });
    const m = mergeIndex(a, b, new Date("2026-07-05T00:00:00Z"));
    expect(m.events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(m.videos.map((v) => v.id).sort()).toEqual(["v1", "v2"]);
    expect(m.updatedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(() => IndexSchema.parse(m)).not.toThrow();
  });
  it("同 id 時 incoming 覆蓋 master", () => {
    const a = idx({ videos: [{ ...vid("v1"), platformVideoId: null }] });
    const b = idx({ videos: [{ ...vid("v1"), platformVideoId: "yt123" }] });
    const m = mergeIndex(a, b);
    expect(m.videos).toHaveLength(1);
    expect(m.videos[0].platformVideoId).toBe("yt123");
  });
});
