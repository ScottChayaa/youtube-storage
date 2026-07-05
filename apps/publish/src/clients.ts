export interface InsertVideoInput {
  filePath: string;
  title: string;
  description: string;
  privacyStatus: "unlisted" | "private";
}

export interface YouTubeApi {
  insertVideo(input: InsertVideoInput): Promise<{ id: string }>;
}

export interface DriveApi {
  findFile(name: string): Promise<string | null>;
  readFile(fileId: string): Promise<string>;
  createFile(name: string, content: string): Promise<string>;
  updateFile(fileId: string, content: string): Promise<void>;
}

export class QuotaExceededError extends Error {
  constructor(message = "YouTube 上傳配額已用盡") {
    super(message);
    this.name = "QuotaExceededError";
  }
}
