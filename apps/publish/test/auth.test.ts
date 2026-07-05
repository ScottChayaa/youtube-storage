import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configDir, tokenPath, loadJson, saveJson, SCOPES } from "../src/auth.js";

describe("auth config", () => {
  it("以 XDG_CONFIG_HOME 決定設定目錄", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/x/cfg" } as NodeJS.ProcessEnv)).toBe("/x/cfg/youtube-storage");
    expect(tokenPath({ XDG_CONFIG_HOME: "/x/cfg" } as NodeJS.ProcessEnv)).toBe("/x/cfg/youtube-storage/token.json");
  });
  it("SCOPES 含 youtube.upload 與 drive.appdata", () => {
    expect(SCOPES).toContain("https://www.googleapis.com/auth/youtube.upload");
    expect(SCOPES).toContain("https://www.googleapis.com/auth/drive.appdata");
  });
});

describe("json 讀寫", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "auth-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
  it("saveJson 後 loadJson 取回相同物件；缺檔回 null", async () => {
    const p = join(dir, "sub", "token.json");
    await saveJson(p, { refresh_token: "r" });
    expect(await loadJson(p)).toEqual({ refresh_token: "r" });
    expect(await loadJson(join(dir, "nope.json"))).toBeNull();
  });
});
