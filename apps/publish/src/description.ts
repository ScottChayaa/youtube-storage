import { type Index } from "@app/core";

function fmt(sec: number): string {
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function buildDescription(index: Index, videoId: string): string {
  return index.segments
    .filter((s) => s.videoId === videoId)
    .sort((a, b) => a.startSec - b.startSec)
    .map((s) => `${fmt(s.startSec)} ${s.caption ?? s.tags.join(" ")}`.trim())
    .join("\n");
}
