import { type Index } from "./schema.js";

function upsertById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const map = new Map<string, T>(base.map((x) => [x.id, x]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

export function mergeIndex(master: Index, incoming: Index, now: Date = new Date()): Index {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    events: upsertById(master.events, incoming.events),
    videos: upsertById(master.videos, incoming.videos),
    segments: upsertById(master.segments, incoming.segments),
  };
}
