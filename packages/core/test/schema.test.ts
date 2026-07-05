import { describe, it, expect } from "vitest";
import { IndexSchema, createEmptyIndex } from "../src/index.js";

describe("index schema", () => {
  it("createEmptyIndex 產生可通過驗證的空索引", () => {
    const idx = createEmptyIndex(new Date("2026-07-05T00:00:00Z"));
    expect(idx.version).toBe(1);
    expect(idx.events).toEqual([]);
    expect(() => IndexSchema.parse(idx)).not.toThrow();
  });

  it("拒絕缺少必填欄位的 segment", () => {
    const bad = { ...createEmptyIndex(), segments: [{ id: "seg_1" }] };
    expect(() => IndexSchema.parse(bad)).toThrow();
  });
});
