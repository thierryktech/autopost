import { spawnSync } from "node:child_process";
import { env } from "../env";
import type { ClaudeAdapter, DriveAdapter, FacebookAdapter, RenderAdapter } from "./types";
import { DemoDriveAdapter } from "./drive/demo";
import { GoogleDriveAdapter } from "./drive/google";
import { DemoClaudeAdapter } from "./claude/demo";
import { DemoFacebookAdapter } from "./facebook/demo";
import { GraphFacebookAdapter } from "./facebook/graph";
import { FfmpegRenderAdapter } from "./render/ffmpeg";
import { SimulatedRenderAdapter } from "./render/simulated";

type Registry = { drive?: DriveAdapter; claude?: ClaudeAdapter; facebook?: FacebookAdapter; render?: RenderAdapter };
const g = globalThis as unknown as { __balenaAdapters?: Registry };
g.__balenaAdapters ??= {};
const reg = g.__balenaAdapters;

export function driveAdapter(): DriveAdapter {
  return (reg.drive ??= env.driveMode === "live" ? new GoogleDriveAdapter() : new DemoDriveAdapter());
}

export async function claudeAdapter(): Promise<ClaudeAdapter> {
  if (!reg.claude) {
    if (env.claudeMode === "live") {
      const { AnthropicClaudeAdapter } = await import("./claude/anthropic");
      reg.claude = new AnthropicClaudeAdapter();
    } else reg.claude = new DemoClaudeAdapter();
  }
  return reg.claude;
}

export function facebookAdapter(): FacebookAdapter {
  return (reg.facebook ??= env.facebookMode === "live" ? new GraphFacebookAdapter() : new DemoFacebookAdapter());
}

export function ffmpegAvailable(): boolean {
  try {
    return spawnSync(process.env.FFMPEG_PATH ?? "ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

export function renderAdapter(): RenderAdapter {
  return (reg.render ??= env.renderMode === "ffmpeg" && ffmpegAvailable() ? new FfmpegRenderAdapter() : new SimulatedRenderAdapter());
}

/** Tests only: replace adapters. */
export function __setAdapters(next: Registry) {
  Object.assign(reg, next);
}

export function integrationModes() {
  return {
    drive: env.driveMode,
    claude: env.claudeMode,
    facebook: env.facebookMode,
    render: renderAdapter().mode,
  };
}
