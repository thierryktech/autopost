import fs from "node:fs";
import type { RenderAdapter, RenderInput } from "../types";

/** SIMULATED renderer for environments without FFmpeg. Produces no real video; flagged as simulated. */
export class SimulatedRenderAdapter implements RenderAdapter {
  readonly mode = "simulated" as const;
  async render(input: RenderInput) {
    const durationMs = input.snapshot.clips.reduce((s, c) => s + (c.outMs - c.inMs), 0);
    for (let p = 0; p <= 100; p += 20) {
      input.onProgress(p);
      await new Promise((r) => setTimeout(r, 300));
    }
    fs.writeFileSync(input.outPath, "SIMULATED RENDER — no video produced");
    return { durationMs, simulated: true };
  }
}
