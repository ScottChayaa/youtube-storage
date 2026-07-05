import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IndexSchema } from "@app/core";
import { runIngest, parseFolderName } from "../src/cli.js";

describe("parseFolderName", () => {
  it("由 'YYYY-MM ...' 取出年月與事件名", () => {
    expect(parseFolderName("2025-07 游泳")).toEqual({
      year: 2025, month: 7, eventName: "2025-07 游泳",
    });
  });
  it("無法解析時 year/month 回退為 0", () => {
    expect(parseFolderName("misc")).toEqual({ year: 0, month: 0, eventName: "misc" });
  });
});

describe("runIngest", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "2025-07 游泳-"));
    await writeFile(join(dir, "a.jpg"), "x");
    await writeFile(join(dir, "b.jpg"), "x");
  });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it("以假 runner 跑完管線，產生合法 index.json", async () => {
    let calledArgs: string[] = [];
    const runner = async (_cmd: string, args: string[]) => { calledArgs = args; };
    const res = await runIngest(dir, { runner, now: new Date("2026-07-05T00:00:00Z") });

    // ffmpeg 有被呼叫，且輸出路徑為 slideshow.mp4
    expect(calledArgs).toContain(join(dir, "slideshow.mp4"));

    const parsed = IndexSchema.parse(JSON.parse(await readFile(res.indexPath, "utf8")));
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.events[0].year).toBe(2025);
    expect(parsed.events[0].month).toBe(7);
  });
});
