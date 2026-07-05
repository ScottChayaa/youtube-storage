import { describe, it, expect, vi } from "vitest";
import { deriveTags, readMeta } from "../src/metadata.js";

describe("deriveTags", () => {
  it("由日期產生年/月 tag，並拆解資料夾名", () => {
    const tags = deriveTags({ date: "2025-07-12", gps: null }, "2025-07 游泳");
    expect(tags).toContain("2025");
    expect(tags).toContain("7月");
    expect(tags).toContain("游泳");
  });
  it("無日期時只用資料夾 token，且結果去重", () => {
    const tags = deriveTags({ date: null, gps: null }, "海邊_海邊");
    expect(tags).toEqual(["海邊"]);
  });
});

describe("readMeta", () => {
  it("解析 exifr 的日期與 GPS", async () => {
    vi.resetModules();
    vi.doMock("exifr", () => ({
      default: { parse: vi.fn().mockResolvedValue({
        DateTimeOriginal: new Date("2025-07-12T09:00:00Z"),
        latitude: 24.7, longitude: 121.74,
      }) },
    }));
    const { readMeta: read } = await import("../src/metadata.js");
    const meta = await read("/fake.jpg");
    expect(meta.date).toBe("2025-07-12");
    expect(meta.gps).toEqual({ lat: 24.7, lng: 121.74 });
  });

  it("exifr 失敗時回傳全 null，不拋錯", async () => {
    vi.resetModules();
    vi.doMock("exifr", () => ({ default: { parse: vi.fn().mockRejectedValue(new Error("bad")) } }));
    const { readMeta: read } = await import("../src/metadata.js");
    expect(await read("/fake.jpg")).toEqual({ date: null, gps: null });
  });
});
