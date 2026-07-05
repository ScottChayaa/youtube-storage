import { createHash } from "node:crypto";

export function eventKey(eventName: string): string {
  return createHash("sha1").update(eventName).digest("hex").slice(0, 8);
}
