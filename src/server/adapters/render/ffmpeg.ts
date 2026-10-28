/*
 * FFmpeg renderer. Produces a 1080x1920, 30 fps, H.264/AAC MP4 suitable for Facebook Reels.
 * Runs only inside the worker process (never inside a web request).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildAss } from "@/lib/ass";
import { AdapterError, type RenderAdapter, type RenderInput } from "../types";

export const FONTS_DIR = path.resolve(process.cwd(), "worker/fonts");
const W = 1080;
const H = 1920;

export function buildFfmpegArgs(input: RenderInput, assPath: string): { args: string[]; durationMs: number } {
  const clips = input.snapshot.clips;
  if (!clips.length) throw new AdapterError("invalid_request", "Nothing to render: the edit has no clips");
  const durationMs = clips.reduce((s, c) => s + Math.max(0, c.outMs - c.inMs), 0);
  const durS = (durationMs / 1000).toFixed(3);
  const args: string[] = ["-hide_banner", "-y", "-nostdin"];
  input.clipPaths.forEach((p) => args.push("-i", p));
  let idx = clips.length;
  let logoIdx = -1;
  let musicIdx = -1;
  if (input.logoPath) {
    args.push("-i", input.logoPath);
    logoIdx = idx++;
  }
  if (input.musicPath && input.snapshot.music.enabled) {
    args.push("-stream_loop", "-1", "-i", input.musicPath);
    musicIdx = idx++;
  }
  const f: string[] = [];
  clips.forEach((c, i) => {
    const s = (c.inMs / 1000).toFixed(3);
    const e = (c.outMs / 1000).toFixed(3);
    f.push(
      `[${i}:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p[v${i}]`,
    );
  });
  f.push(`${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[vc]`);
  let last = "vc";
  if (logoIdx >= 0) {
    f.push(`[${logoIdx}:v]scale=180:-1[lg]`, `[${last}][lg]overlay=W-w-56:72[vl]`);
    last = "vl";
  }
  const assEsc = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const fontsEsc = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
  f.push(`[${last}]subtitles='${assEsc}':fontsdir='${fontsEsc}'[vout]`);
  if (musicIdx >= 0) {
    const vol = Math.max(0, Math.min(1, input.snapshot.music.volume ?? 0.6)).toFixed(2);
    const fadeOut = Math.max(0, durationMs / 1000 - 1.2).toFixed(3);
    f.push(`[${musicIdx}:a]atrim=0:${durS},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=1.2,volume=${vol}[aout]`);
  } else {
    f.push(`anullsrc=r=48000:cl=stereo,atrim=0:${durS}[aout]`);
  }
  args.push(
    "-filter_complex", f.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-t", durS,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-r", "30", "-g", "60",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    input.outPath,
  );
  return { args, durationMs };
}

export class FfmpegRenderAdapter implements RenderAdapter {
  readonly mode = "ffmpeg" as const;
  constructor(private ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg") {}

  async render(input: RenderInput): Promise<{ durationMs: number; simulated: boolean }> {
    const workDir = path.dirname(input.outPath);
    const assPath = path.join(workDir, "subtitles.ass");
    fs.writeFileSync(assPath, buildAss(input.snapshot.subtitles, input.snapshot.subtitleStyle, W, H), "utf8");
    const { args, durationMs } = buildFfmpegArgs(input, assPath);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(/*turbopackIgnore: true*/ this.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      proc.stdout.on("data", (buf: Buffer) => {
        const m = /out_time_(?:ms|us)=(\d+)/.exec(buf.toString());
        if (m) input.onProgress(Math.min(99, Math.round((Number(m[1]) / 1000 / durationMs) * 100)));
      });
      proc.stderr.on("data", (b: Buffer) => {
        stderr = (stderr + b.toString()).slice(-4000);
      });
      proc.on("error", (e) => reject(new AdapterError("not_configured", `FFmpeg could not start: ${e.message}`, false, false)));
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new AdapterError("server_error", `FFmpeg exited with code ${code}: ${stderr.split("\n").slice(-6).join(" ")}`, false, false));
      });
    });
    input.onProgress(100);
    return { durationMs, simulated: false };
  }
}
