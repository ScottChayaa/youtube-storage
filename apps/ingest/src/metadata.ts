import exifr from "exifr";

export interface MediaMeta {
  date: string | null;
  gps: { lat: number; lng: number } | null;
}

export async function readMeta(filePath: string): Promise<MediaMeta> {
  const data = await exifr.parse(filePath, { gps: true }).catch(() => null);
  const dt: Date | undefined = data?.DateTimeOriginal ?? data?.CreateDate;
  const date = dt instanceof Date ? dt.toISOString().slice(0, 10) : null;
  const gps =
    data && data.latitude != null && data.longitude != null
      ? { lat: data.latitude as number, lng: data.longitude as number }
      : null;
  return { date, gps };
}

export function deriveTags(meta: MediaMeta, folderName: string): string[] {
  const tags = new Set<string>();
  if (meta.date) {
    const [y, m] = meta.date.split("-");
    tags.add(y);
    tags.add(`${Number(m)}月`);
  }
  for (const tok of folderName.split(/[\s_\-/]+/).filter(Boolean)) tags.add(tok);
  return [...tags];
}
