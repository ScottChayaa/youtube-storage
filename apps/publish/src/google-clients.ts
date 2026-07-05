import { google } from "googleapis";
import { createReadStream } from "node:fs";
import type { OAuth2Client } from "google-auth-library";
import { QuotaExceededError, type YouTubeApi, type DriveApi, type InsertVideoInput } from "./clients.js";

export function mapInsertError(err: unknown): unknown {
  const anyErr = err as { errors?: { reason?: string }[]; response?: { data?: { error?: { errors?: { reason?: string }[] } } } };
  const reason =
    anyErr?.errors?.[0]?.reason ??
    anyErr?.response?.data?.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded" || reason === "uploadLimitExceeded") {
    return new QuotaExceededError();
  }
  return err;
}

export function realYouTubeApi(auth: OAuth2Client): YouTubeApi {
  const yt = google.youtube({ version: "v3", auth });
  return {
    async insertVideo(input: InsertVideoInput) {
      try {
        const res = await yt.videos.insert({
          part: ["snippet", "status"],
          requestBody: {
            snippet: { title: input.title, description: input.description },
            status: { privacyStatus: input.privacyStatus },
          },
          media: { body: createReadStream(input.filePath) },
        });
        return { id: res.data.id! };
      } catch (err) {
        throw mapInsertError(err);
      }
    },
  };
}

export function realDriveApi(auth: OAuth2Client): DriveApi {
  const drive = google.drive({ version: "v3", auth });
  return {
    async findFile(name) {
      const res = await drive.files.list({
        spaces: "appDataFolder",
        q: `name='${name}'`,
        fields: "files(id,name)",
      });
      return res.data.files?.[0]?.id ?? null;
    },
    async readFile(fileId) {
      const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
      return res.data as unknown as string;
    },
    async createFile(name, content) {
      const res = await drive.files.create({
        requestBody: { name, parents: ["appDataFolder"] },
        media: { mimeType: "application/json", body: content },
        fields: "id",
      });
      return res.data.id!;
    },
    async updateFile(fileId, content) {
      await drive.files.update({ fileId, media: { mimeType: "application/json", body: content } });
    },
  };
}
