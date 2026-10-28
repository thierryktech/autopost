/*
 * Generates DEMO footage locally with FFmpeg (animated gradients watermarked "DEMO") so the
 * library, preview, editor and render pipeline can be exercised before Google Drive is connected.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DEMO_CATALOG, DEMO_MEDIA_SCALE } from "./adapters/drive/demo-catalog";
import { demoDir, demoFilePath, demoThumbPath } from "./adapters/drive/demo";
import { ffmpegAvailable } from "./adapters";

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (b) => (err += b.toString()));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500)))));
    p.on("error", reject);
  });
}

let running: Promise<void> | null = null;

export function ensureDemoMedia(): Promise<void> {
  running ??= generate().finally(() => {
    running = null;
  });
  return running;
}

async function generate() {
  if (!ffmpegAvailable()) {
    console.warn("[demo-media] FFmpeg not found; demo thumbnails will use placeholders and preview is disabled.");
    return;
  }
  fs.mkdirSync(path.join(demoDir(), "files"), { recursive: true });
  fs.mkdirSync(path.join(demoDir(), "thumbs"), { recursive: true });
  const fontFile = path.resolve(process.cwd(), "worker/fonts/Prompt-Medium.ttf").replace(/:/g, "\\:");
  for (const n of DEMO_CATALOG) {
    if (n.missing) continue;
    const out = demoFilePath(n.id);
    if (n.kind === "video" && !fs.existsSync(out)) {
      const w = Math.round(((n.width ?? 1080) * DEMO_MEDIA_SCALE) / 2) * 2;
      const h = Math.round(((n.height ?? 1920) * DEMO_MEDIA_SCALE) / 2) * 2;
      const dur = (n.durationMs ?? 10000) / 1000;
      const [c0, c1] = n.palette ?? ["#2f5257", "#e8c39e"];
      const label = n.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
      const fs1 = Math.round(Math.min(w, h) / 16);
      const vf = [
        "noise=alls=10:allf=t",
        `drawtext=fontfile='${fontFile}':text='DEMO':fontcolor=white@0.35:fontsize=${fs1 * 3}:x=(w-tw)/2:y=(h-th)/2`,
        `drawtext=fontfile='${fontFile}':text='${label}':fontcolor=white@0.9:fontsize=${fs1}:x=(w-tw)/2:y=h*0.08`,
        `drawtext=fontfile='${fontFile}':text='%{pts\\:hms}':fontcolor=white@0.8:fontsize=${Math.round(fs1 * 0.8)}:x=(w-tw)/2:y=h*0.88`,
      ].join(",");
      await run([
        "-f", "lavfi",
        "-i", `gradients=s=${w}x${h}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${w}:y1=${h}:speed=0.03:rate=30:duration=${dur}`,
        "-vf", vf,
        "-t", String(dur),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        out,
      ]);
      await run(["-ss", "1", "-i", out, "-frames:v", "1", "-vf", "scale=360:-2", demoThumbPath(n.id)]);
    }
    if (n.kind === "audio" && !fs.existsSync(out)) {
      const dur = (n.durationMs ?? 30000) / 1000;
      await run([
        "-f", "lavfi", "-i", `sine=f=220:d=${dur}`,
        "-f", "lavfi", "-i", `sine=f=277.18:d=${dur}`,
        "-f", "lavfi", "-i", `sine=f=329.63:d=${dur}`,
        "-filter_complex", "[0][1][2]amix=inputs=3,tremolo=f=0.5:d=0.4,volume=0.6,afade=t=in:d=2",
        "-c:a", "aac", "-b:a", "96k", out,
      ]);
    }
  }
}
