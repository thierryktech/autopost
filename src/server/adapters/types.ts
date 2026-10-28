/*
 * Adapter boundary between the app and external services. The UI and services only depend on
 * these interfaces; demo implementations are clearly labelled and never report a simulated
 * result as a real integration.
 */
import type { EditSnapshot, SubtitleCue } from "../db/schema";
import type { FbVideoStatus } from "@/lib/domain/publish";

export type AdapterErrorCode =
  | "auth_expired"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "invalid_request"
  | "network"
  | "server_error"
  | "not_configured"
  | "unsupported";

export class AdapterError extends Error {
  constructor(
    public code: AdapterErrorCode,
    message: string,
    /** True when the remote side may have completed the request despite the error. */
    public ambiguous = false,
    public retryable = code === "network" || code === "server_error" || code === "rate_limited",
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

// ---------- Google Drive ----------
export interface DriveItem {
  id: string; // stable Drive file id
  name: string;
  kind: "folder" | "video" | "audio" | "image" | "other";
  mimeType: string;
  parentId: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  md5: string | null;
  hasThumbnail: boolean;
}

export interface DriveListing {
  folder: { id: string; name: string };
  breadcrumbs: { id: string; name: string }[];
  items: DriveItem[];
}

export interface DriveAdapter {
  readonly mode: "demo" | "live";
  listFolder(folderId: string | null): Promise<DriveListing>;
  search(query: string, withinFolderId: string | null): Promise<DriveItem[]>;
  getFile(fileId: string): Promise<DriveItem>;
  /** Streams file content (supports HTTP Range) for the authenticated preview proxy. */
  fetchContent(fileId: string, range: string | null): Promise<Response>;
  fetchThumbnail(fileId: string): Promise<Response>;
  downloadTo(fileId: string, destPath: string): Promise<void>;
  uploadFile(localPath: string, name: string, folderId: string): Promise<DriveItem>;
  ensureOutputFolder(name: string): Promise<{ id: string; name: string }>;
}

// ---------- Claude ----------
export interface DraftInput {
  brief: {
    purpose: string;
    targetDurationSec: number;
    style: string;
    notes: string;
  };
  clips: { footageId: string; name: string; durationMs: number; keyframesJpeg?: Buffer[] }[];
  product: { name: string; nameTh: string | null; verifiedFacts: string[]; type: string } | null;
  brand: { toneOfVoice: string; defaultCtas: string[]; prohibitedClaims: string[] };
}

export interface EditDraft {
  clips: { footageId: string; inMs: number; outMs: number }[];
  subtitles: SubtitleCue[];
  captionTh: string;
  rationale: string;
  generatedBy: "claude" | "demo_template";
  model: string | null;
}

export interface ClaudeAdapter {
  readonly mode: "demo" | "live";
  draftEdit(input: DraftInput): Promise<EditDraft>;
}

// ---------- Rendering ----------
export interface RenderInput {
  snapshot: EditSnapshot;
  clipPaths: string[]; // local paths, same order as snapshot.clips
  musicPath: string | null;
  logoPath: string | null;
  outPath: string;
  onProgress: (pct: number) => void;
}

export interface RenderAdapter {
  readonly mode: "ffmpeg" | "simulated";
  render(input: RenderInput): Promise<{ durationMs: number; simulated: boolean }>;
}

// ---------- Facebook ----------
export interface FacebookAdapter {
  readonly mode: "demo" | "live";
  startUpload(): Promise<{ videoId: string; uploadUrl: string }>;
  upload(videoId: string, uploadUrl: string, filePath: string): Promise<void>;
  finish(args: {
    videoId: string;
    description: string;
    videoState: "PUBLISHED" | "SCHEDULED";
    scheduledPublishTime?: Date;
  }): Promise<void>;
  getStatus(videoId: string): Promise<FbVideoStatus>;
}
