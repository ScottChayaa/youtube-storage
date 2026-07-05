import { mergeIndex, createEmptyIndex, IndexSchema, type Index } from "@app/core";
import type { DriveApi } from "./clients.js";

export const MASTER_INDEX_NAME = "master-index.json";

export async function syncToDrive(drive: DriveApi, incoming: Index, now: Date = new Date()): Promise<Index> {
  const fileId = await drive.findFile(MASTER_INDEX_NAME);
  const master: Index = fileId
    ? IndexSchema.parse(JSON.parse(await drive.readFile(fileId)))
    : createEmptyIndex(now);
  const merged = mergeIndex(master, incoming, now);
  const content = JSON.stringify(merged, null, 2);
  if (fileId) await drive.updateFile(fileId, content);
  else await drive.createFile(MASTER_INDEX_NAME, content);
  return merged;
}
