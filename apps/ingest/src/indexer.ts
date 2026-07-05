import { createEmptyIndex, type Index, type Platform } from "@app/core";
import type { MediaFile } from "./scan.js";
import type { SlideTiming } from "./slideshow.js";
import type { MediaMeta } from "./metadata.js";

export interface PhotoEntryInput {
  file: MediaFile;
  meta: MediaMeta;
  tags: string[];
  timing: SlideTiming;
}

export interface BuildIndexInput {
  eventName: string;
  year: number;
  month: number;
  slideshowVideoId: string;
  slideshowDurationSec: number;
  sourceBatch: string;
  photos: PhotoEntryInput[];
}

export function buildIndex(input: BuildIndexInput, now: Date = new Date()): Index {
  const idx = createEmptyIndex(now);
  const platform: Platform = "youtube";
  const eventId = `evt_${input.year}_${String(input.month).padStart(2, "0")}`;

  idx.events.push({
    id: eventId,
    name: input.eventName,
    year: input.year,
    month: input.month,
  });

  idx.videos.push({
    id: input.slideshowVideoId,
    platform,
    platformVideoId: null,
    type: "slideshow",
    title: input.eventName,
    durationSec: input.slideshowDurationSec,
    uploadDate: null,
    sourceBatch: input.sourceBatch,
  });

  input.photos.forEach((p, i) => {
    idx.segments.push({
      id: `seg_${String(i + 1).padStart(4, "0")}`,
      eventId,
      videoId: input.slideshowVideoId,
      platform,
      platformVideoId: null,
      startSec: p.timing.startSec,
      endSec: p.timing.endSec,
      sourceFile: p.file.path,
      thumbnail: null,
      tags: p.tags,
      date: p.meta.date,
      gps: p.meta.gps,
    });
  });

  return idx;
}
