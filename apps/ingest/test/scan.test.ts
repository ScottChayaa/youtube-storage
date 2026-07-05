import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, scanDirectory } from "../src/scan.js";

describe("classify", () => {
  it("依副檔名判斷型別，不分大小寫", () => {
    expect(classify(".JPG")).toBe("photo");
    expect(classify(".mp4")).toBe("video");
    expect(classify(".txt")).toBeNull();
  });
});

describe("scanDirectory", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "scan-"));
    await writeFile(join(dir, "b.jpg"), "x");
    await writeFile(join(dir, "a.mp4"), "x");
    await writeFile(join(dir, "note.txt"), "x");
    await mkdir(join(dir, "sub"));
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("只回傳媒體檔、忽略子目錄、依檔名排序", async () => {
    const files = await scanDirectory(dir);
    expect(files.map((f) => f.name)).toEqual(["a.mp4", "b.jpg"]);
    expect(files[0].kind).toBe("video");
    expect(files[1].kind).toBe("photo");
  });
});
