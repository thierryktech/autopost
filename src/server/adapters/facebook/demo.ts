import fs from "node:fs";
import path from "node:path";
import { env } from "../../env";
import { AdapterError, type FacebookAdapter } from "../types";
import type { FbVideoStatus } from "@/lib/domain/publish";

/**
 * DEMO Facebook adapter: simulates Meta's upload/finish/status cycle locally. Nothing is posted.
 * Supports fault injection (used by tests) to exercise ambiguous responses and duplicate prevention.
 */
export interface DemoFbFaults {
  /** Next finish call: "ambiguous" = request lands at Meta but the response is lost. */
  nextFinish?: "ambiguous" | "error" | null;
  nextStart?: "network" | null;
}

interface DemoVideo {
  id: string;
  uploaded: boolean;
  finishedAt: number | null;
  state: "PUBLISHED" | "SCHEDULED" | null;
  scheduledFor: number | null;
  description: string | null;
}

const PUBLISH_DELAY_MS = Number(process.env.DEMO_FB_PUBLISH_DELAY_MS ?? 8000);

function stateFile() {
  return path.resolve(env.dataDir, "demo-facebook.json");
}

export class DemoFacebookAdapter implements FacebookAdapter {
  readonly mode = "demo" as const;
  constructor(public faults: DemoFbFaults = {}) {}

  private read(): { videos: Record<string, DemoVideo>; finishCalls: number } {
    try {
      return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    } catch {
      return { videos: {}, finishCalls: 0 };
    }
  }
  private write(s: { videos: Record<string, DemoVideo>; finishCalls: number }) {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
  }

  /** Number of finish calls ever received — lets tests prove no duplicate publish requests. */
  stats() {
    const s = this.read();
    return { finishCalls: s.finishCalls, videos: Object.keys(s.videos).length, published: Object.values(s.videos).filter((v) => v.finishedAt).length };
  }

  async startUpload() {
    if (this.faults.nextStart === "network") {
      this.faults.nextStart = null;
      throw new AdapterError("network", "Simulated network error on start");
    }
    const s = this.read();
    const id = `demo_video_${Date.now()}${Math.floor(Math.random() * 1000)}`;
    s.videos[id] = { id, uploaded: false, finishedAt: null, state: null, scheduledFor: null, description: null };
    this.write(s);
    return { videoId: id, uploadUrl: `demo://rupload/${id}` };
  }

  async upload(videoId: string, _uploadUrl: string, filePath: string) {
    const s = this.read();
    if (!s.videos[videoId]) throw new AdapterError("not_found", "Unknown demo video");
    if (!fs.existsSync(filePath)) throw new AdapterError("not_found", "Rendered file missing");
    s.videos[videoId].uploaded = true;
    this.write(s);
  }

  async finish(args: { videoId: string; description: string; videoState: "PUBLISHED" | "SCHEDULED"; scheduledPublishTime?: Date }) {
    const s = this.read();
    const v = s.videos[args.videoId];
    if (!v) throw new AdapterError("not_found", "Unknown demo video");
    if (this.faults.nextFinish === "error") {
      this.faults.nextFinish = null;
      throw new AdapterError("invalid_request", "Simulated: Meta rejected the finish request", false, false);
    }
    s.finishCalls += 1;
    v.finishedAt = Date.now();
    v.state = args.videoState;
    v.scheduledFor = args.scheduledPublishTime?.getTime() ?? null;
    v.description = args.description;
    this.write(s);
    if (this.faults.nextFinish === "ambiguous") {
      this.faults.nextFinish = null;
      throw new AdapterError("network", "Simulated: connection dropped after Meta received the request", true);
    }
  }

  async getStatus(videoId: string): Promise<FbVideoStatus> {
    const v = this.read().videos[videoId];
    if (!v) throw new AdapterError("not_found", "Unknown demo video");
    const now = Date.now();
    const base: FbVideoStatus = {
      uploading: v.uploaded ? "complete" : "in_progress",
      processing: v.uploaded ? "complete" : "not_started",
      publishing: "not_started",
      publishStatus: "not_published",
      postId: null,
      permalink: null,
      errorMessage: null,
    };
    if (!v.finishedAt) return base;
    if (v.state === "SCHEDULED" && v.scheduledFor && now < v.scheduledFor) {
      return { ...base, publishing: "complete", publishStatus: "scheduled" };
    }
    const publishAt = v.state === "SCHEDULED" && v.scheduledFor ? v.scheduledFor : v.finishedAt + PUBLISH_DELAY_MS;
    if (now < publishAt) return { ...base, publishing: "in_progress" };
    return { ...base, publishing: "complete", publishStatus: "published", postId: `demo_post_${videoId}`, permalink: null };
  }
}
