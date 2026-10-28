/*
 * LIVE Facebook Page Reels adapter (Graph API).
 *
 * Flow (per Meta's Reels Publishing API, verify against current docs before enabling):
 *   1. POST /{page-id}/video_reels  upload_phase=start                  -> { video_id, upload_url }
 *   2. POST https://rupload.facebook.com/video-upload/{ver}/{video_id}  (binary, offset/file_size headers)
 *   3. POST /{page-id}/video_reels  upload_phase=finish, video_id, video_state=PUBLISHED|SCHEDULED,
 *                                   scheduled_publish_time (unix s), description
 *   4. GET  /{video_id}?fields=status,permalink_url                      -> phase statuses
 * Permissions (Page access token): pages_show_list, pages_read_engagement, pages_manage_posts.
 * Product tags are NOT part of this API; tagging is handed off manually in the UI.
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { env } from "../../env";
import { readTokens, getConnection, setConnectionStatus } from "../../connections";
import { AdapterError, type FacebookAdapter } from "../types";
import type { FbVideoStatus } from "@/lib/domain/publish";

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string; is_transient?: boolean };
}

async function pageCreds(): Promise<{ pageId: string; token: string }> {
  const conn = await getConnection("facebook");
  const tokens = await readTokens("facebook");
  if (!conn?.externalId || !tokens?.pageAccessToken) throw new AdapterError("not_configured", "No Facebook Page is connected");
  return { pageId: conn.externalId, token: tokens.pageAccessToken };
}

async function mapGraphError(res: Response, ambiguousOnServerError: boolean): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as GraphError;
  const e = body.error ?? {};
  const msg = e.message ?? `Facebook error ${res.status}`;
  if (e.code === 190) {
    await setConnectionStatus("facebook", "expired", msg);
    throw new AdapterError("auth_expired", "Facebook session expired. Reconnect your Page.");
  }
  if (e.code === 10 || (e.code && e.code >= 200 && e.code < 300)) {
    await setConnectionStatus("facebook", "permission_denied", msg);
    throw new AdapterError("permission_denied", `Facebook permission missing: ${msg}`);
  }
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) throw new AdapterError("rate_limited", msg);
  if (res.status >= 500 || e.is_transient || e.code === 1 || e.code === 2) {
    throw new AdapterError("server_error", msg, ambiguousOnServerError);
  }
  throw new AdapterError("invalid_request", msg, false, false);
}

export class GraphFacebookAdapter implements FacebookAdapter {
  readonly mode = "live" as const;
  private base = `https://graph.facebook.com/${env.graphApiVersion}`;

  async startUpload() {
    const { pageId, token } = await pageCreds();
    const res = await fetch(`${this.base}/${pageId}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ upload_phase: "start", access_token: token }),
    }).catch((e: Error) => {
      // An orphaned upload session is harmless, so start is safe to retry.
      throw new AdapterError("network", `Could not reach Facebook: ${e.message}`);
    });
    if (!res.ok) await mapGraphError(res, false);
    const json = (await res.json()) as { video_id: string; upload_url: string };
    return { videoId: json.video_id, uploadUrl: json.upload_url };
  }

  async upload(videoId: string, uploadUrl: string, filePath: string) {
    const { token } = await pageCreds();
    const size = fs.statSync(filePath).size;
    const res = await fetch(uploadUrl || `https://rupload.facebook.com/video-upload/${env.graphApiVersion}/${videoId}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(size), "Content-Type": "application/octet-stream" },
      body: Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream,
      // @ts-expect-error Node fetch requires duplex for streamed bodies
      duplex: "half",
    }).catch((e: Error) => {
      throw new AdapterError("network", `Upload interrupted: ${e.message}`);
    });
    if (!res.ok) await mapGraphError(res, false);
  }

  async finish(args: { videoId: string; description: string; videoState: "PUBLISHED" | "SCHEDULED"; scheduledPublishTime?: Date }) {
    const { pageId, token } = await pageCreds();
    const body = new URLSearchParams({
      upload_phase: "finish",
      video_id: args.videoId,
      video_state: args.videoState,
      description: args.description,
      access_token: token,
    });
    if (args.videoState === "SCHEDULED" && args.scheduledPublishTime) {
      body.set("scheduled_publish_time", String(Math.floor(args.scheduledPublishTime.getTime() / 1000)));
    }
    let res: Response;
    try {
      res = await fetch(`${this.base}/${pageId}/video_reels`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      // The request may have reached Facebook. Never retry blindly — reconcile instead.
      throw new AdapterError("network", `No response from Facebook: ${(e as Error).message}`, true);
    }
    if (!res.ok) await mapGraphError(res, true);
    const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (!json?.success) throw new AdapterError("server_error", "Facebook did not confirm the finish request", true);
  }

  async getStatus(videoId: string): Promise<FbVideoStatus> {
    const { token } = await pageCreds();
    const res = await fetch(
      `${this.base}/${videoId}?fields=status,permalink_url,published&access_token=${encodeURIComponent(token)}`,
    ).catch((e: Error) => {
      throw new AdapterError("network", e.message);
    });
    if (!res.ok) await mapGraphError(res, false);
    const json = (await res.json()) as {
      status?: {
        video_status?: string;
        uploading_phase?: { status?: string };
        processing_phase?: { status?: string; errors?: { message?: string }[] };
        publishing_phase?: { status?: string; publish_status?: string; errors?: { message?: string }[] };
      };
      permalink_url?: string;
      published?: boolean;
      id: string;
    };
    const ph = (s?: string): FbVideoStatus["uploading"] =>
      s === "complete" ? "complete" : s === "in_progress" ? "in_progress" : s === "error" ? "error" : "not_started";
    const ps = json.status?.publishing_phase?.publish_status;
    return {
      uploading: ph(json.status?.uploading_phase?.status),
      processing: ph(json.status?.processing_phase?.status),
      publishing: ph(json.status?.publishing_phase?.status),
      publishStatus: ps === "published" || json.published ? "published" : ps === "scheduled" ? "scheduled" : ps ? "not_published" : "unknown",
      postId: json.id ?? null,
      permalink: json.permalink_url ? `https://www.facebook.com${json.permalink_url.replace(/^https?:\/\/[^/]+/, "")}` : null,
      errorMessage:
        json.status?.processing_phase?.errors?.[0]?.message ?? json.status?.publishing_phase?.errors?.[0]?.message ?? null,
    };
  }
}
