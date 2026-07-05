export interface SlideshowOptions {
  secondsPerPhoto: number;
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_SLIDESHOW: SlideshowOptions = {
  secondsPerPhoto: 4,
  width: 3840,
  height: 2160,
  fps: 30,
};

export interface SlideTiming {
  sourceFile: string;
  startSec: number;
  endSec: number;
}

export function computeTimings(photoPaths: string[], opts: SlideshowOptions): SlideTiming[] {
  return photoPaths.map((p, i) => ({
    sourceFile: p,
    startSec: i * opts.secondsPerPhoto,
    endSec: (i + 1) * opts.secondsPerPhoto,
  }));
}

export function totalDurationSec(timings: SlideTiming[]): number {
  return timings.length ? timings[timings.length - 1].endSec : 0;
}

function quote(path: string): string {
  return path.replace(/'/g, "'\\''");
}

export function buildConcatFile(timings: SlideTiming[]): string {
  const lines: string[] = [];
  for (const t of timings) {
    lines.push(`file '${quote(t.sourceFile)}'`);
    lines.push(`duration ${t.endSec - t.startSec}`);
  }
  if (timings.length) lines.push(`file '${quote(timings[timings.length - 1].sourceFile)}'`);
  return lines.join("\n") + "\n";
}

export function buildFfmpegArgs(
  concatFilePath: string,
  outPath: string,
  opts: SlideshowOptions,
): string[] {
  const scale =
    `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,` +
    `pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`;
  return [
    "-y",
    "-f", "concat", "-safe", "0", "-i", concatFilePath,
    "-vf", `${scale},fps=${opts.fps}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(opts.fps),
    outPath,
  ];
}
