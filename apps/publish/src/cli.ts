import { getAuthClient } from "./auth.js";
import { realYouTubeApi, realDriveApi } from "./google-clients.js";
import { YouTubeBackend } from "./youtube-backend.js";
import { runPublish } from "./publish.js";

export async function main(folder: string): Promise<void> {
  const auth = await getAuthClient();
  const backend = new YouTubeBackend(realYouTubeApi(auth));
  const drive = realDriveApi(auth);
  const res = await runPublish(folder, { backend, drive });
  console.log(`完成：本次上傳 ${res.uploaded} 支，已同步 Drive 主索引。`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const folder = process.argv[2];
  if (!folder) {
    console.error("用法: publish <資料夾路徑>");
    process.exit(1);
  }
  main(folder).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
