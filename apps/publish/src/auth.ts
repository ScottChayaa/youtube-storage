import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/drive.appdata",
];

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "youtube-storage");
}
export function tokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "token.json");
}
export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "credentials.json");
}

export async function loadJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}
export async function saveJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

interface InstalledCreds {
  installed: { client_id: string; client_secret: string };
}

// 手動整合：需要 GCP 憑證與瀏覽器。單元測試不涵蓋此函式。
export async function getAuthClient(env: NodeJS.ProcessEnv = process.env): Promise<OAuth2Client> {
  const creds = await loadJson<InstalledCreds>(credentialsPath(env));
  if (!creds) {
    throw new Error(`找不到 ${credentialsPath(env)}，請依 docs/superpowers/plans/plan2-google-setup.md 建立桌面 OAuth 憑證`);
  }
  const { client_id, client_secret } = creds.installed;

  const saved = await loadJson<Record<string, unknown>>(tokenPath(env));
  if (saved) {
    const client = new google.auth.OAuth2(client_id, client_secret);
    client.setCredentials(saved);
    return client;
  }

  // Loopback：起臨時本機伺服器接收授權碼
  return await new Promise<OAuth2Client>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "", "http://127.0.0.1");
        const code = url.searchParams.get("code");
        if (!code) { res.end("等待授權碼…"); return; }
        res.end("授權完成，可關閉此分頁。");
        server.close();
        const port = (server.address() as { port: number }).port;
        const client = new google.auth.OAuth2(client_id, client_secret, `http://127.0.0.1:${port}`);
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        await saveJson(tokenPath(env), tokens);
        resolve(client);
      } catch (e) {
        reject(e);
      }
    });
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const client = new google.auth.OAuth2(client_id, client_secret, `http://127.0.0.1:${port}`);
      const authUrl = client.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });
      console.log(`請在瀏覽器開啟並授權：\n${authUrl}`);
    });
  });
}
