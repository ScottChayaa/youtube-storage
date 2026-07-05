import { spawn } from "node:child_process";

export type Runner = (cmd: string, args: string[]) => Promise<void>;

export const realRunner: Runner = (cmd, args) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });

export async function runFfmpeg(args: string[], runner: Runner = realRunner): Promise<void> {
  await runner("ffmpeg", args);
}
