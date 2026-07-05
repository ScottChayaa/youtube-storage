import { z } from "zod";

export const Platform = z.enum(["youtube"]);
export type Platform = z.infer<typeof Platform>;

export const EventEntry = z.object({
  id: z.string(),
  name: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  location: z.string().optional(),
});
export type EventEntry = z.infer<typeof EventEntry>;

export const VideoEntry = z.object({
  id: z.string(),
  platform: Platform,
  platformVideoId: z.string().nullable(),
  type: z.enum(["slideshow", "clip"]),
  title: z.string(),
  durationSec: z.number().nonnegative(),
  uploadDate: z.string().nullable(),
  sourceBatch: z.string(),
});
export type VideoEntry = z.infer<typeof VideoEntry>;

export const SegmentEntry = z.object({
  id: z.string(),
  eventId: z.string(),
  videoId: z.string(),
  platform: Platform,
  platformVideoId: z.string().nullable(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  sourceFile: z.string(),
  thumbnail: z.string().nullable(),
  tags: z.array(z.string()),
  caption: z.string().optional(),
  date: z.string().nullable(),
  gps: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});
export type SegmentEntry = z.infer<typeof SegmentEntry>;

export const IndexSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  events: z.array(EventEntry),
  videos: z.array(VideoEntry),
  segments: z.array(SegmentEntry),
});
export type Index = z.infer<typeof IndexSchema>;

export function createEmptyIndex(now: Date = new Date()): Index {
  return { version: 1, updatedAt: now.toISOString(), events: [], videos: [], segments: [] };
}
