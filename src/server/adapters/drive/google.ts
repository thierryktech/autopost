/*
 * LIVE Google Drive adapter (Drive API v3 over REST).
 *
 * Scopes requested at connection time (see src/app/api/connect/google-drive):
 *  - https://www.googleapis.com/auth/drive.readonly  browse/search folders and download source footage
 *  - https://www.googleapis.com/auth/drive.file      create the renders folder and upload rendered Reels
 * The app never asks for full read/write access to Drive ("drive" scope).
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { env } from "../../env";
import { readTokens, upsertConnection, setConnectionStatus } from "../../connections";
import { AdapterError, type DriveAdapter, type DriveItem, type DriveListing } from "../types";
import { GOOGLE_TOKEN_URL_PUBLIC } from "./google-constants";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FIELDS =
  "id,name,mimeType,parents,size,modifiedTime,md5Checksum,hasThumbnail,thumbnailLink,videoMediaMetadata(width,height,durationMillis)";
const FOLDER_MIME = "application/vnd.google-apps.folder";

interface GFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  hasThumbnail?: boolean;
  thumbnailLink?: string;
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

function toItem(f: GFile): DriveItem {
  const kind: DriveItem["kind"] =
    f.mimeType === FOLDER_MIME
      ? "folder"
      : f.mimeType.startsWith("video/")
        ? "video"
        : f.mimeType.startsWith("audio/")
          ? "audio"
          : f.mimeType.startsWith("image/")
            ? "image"
            : "other";
  return {
    id: f.id,
    name: f.name,
    kind,
    mimeType: f.mimeType,
    parentId: f.parents?.[0] ?? null,
    durationMs: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) : null,
    width: f.videoMediaMetadata?.width ?? null,
    height: f.videoMediaMetadata?.height ?? null,
    sizeBytes: f.size ? Number(f.size) : null,
    modifiedAt: f.modifiedTime ?? null,
    md5: f.md5Checksum ?? null,
    hasThumbnail: !!f.hasThumbnail,
  };
}

async function accessToken(forceRefresh = false): Promise<string> {
  const tokens = await readTokens("google_drive");
  if (!tokens) throw new AdapterError("not_configured", "Google Drive is not connected");
  const fresh = tokens.expiresAt && tokens.expiresAt - Date.now() > 60_000;
  if (fresh && !forceRefresh) return tokens.accessToken;
  if (!tokens.refreshToken) {
    await setConnectionStatus("google_drive", "expired", "Session expired and no refresh token is stored. Reconnect Drive.");
    throw new AdapterError("auth_expired", "Google Drive session expired. Reconnect Drive.");
  }
  const res = await fetch(GOOGLE_TOKEN_URL_PUBLIC, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    // invalid_grant = revoked, or refresh token expired (7 days for apps in "Testing" status).
    await setConnectionStatus("google_drive", "expired", `Token refresh failed (${json.error ?? res.status}). Reconnect Drive.`);
    throw new AdapterError("auth_expired", "Google Drive session expired. Reconnect Drive.");
  }
  await upsertConnection("google_drive", {
    status: "connected",
    lastError: null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    tokens: { ...tokens, accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 },
  });
  return json.access_token;
}

async function gfetch(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new AdapterError("network", `Could not reach Google Drive: ${(e as Error).message}`);
  }
  if (res.status === 401 && !retried) {
    await accessToken(true);
    return gfetch(url, init, true);
  }
  if (res.ok || res.status === 206) return res;
  const body = await res.text().catch(() => "");
  if (res.status === 401) {
    await setConnectionStatus("google_drive", "expired", "Drive rejected the access token.");
    throw new AdapterError("auth_expired", "Google Drive session expired. Reconnect Drive.");
  }
  if (res.status === 403) {
    if (/rateLimitExceeded|userRateLimitExceeded/.test(body)) throw new AdapterError("rate_limited", "Drive rate limit reached");
    throw new AdapterError("permission_denied", "Drive denied access to this file or folder.");
  }
  if (res.status === 404) throw new AdapterError("not_found", "File is no longer available in Drive (deleted, moved to trash or unshared).");
  if (res.status === 429) throw new AdapterError("rate_limited", "Drive rate limit reached");
  if (res.status >= 500) throw new AdapterError("server_error", `Drive error ${res.status}`);
  throw new AdapterError("invalid_request", `Drive request failed (${res.status}): ${body.slice(0, 200)}`);
}

async function listAll(q: string): Promise<GFile[]> {
  const out: GFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${FIELDS})`,
      pageSize: "200",
      orderBy: "folder,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await gfetch(`${API}/files?${params}`);
    const json = (await res.json()) as { files: GFile[]; nextPageToken?: string };
    out.push(...json.files);
    pageToken = json.nextPageToken;
  } while (pageToken && out.length < 2000);
  return out;
}

const escapeQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export class GoogleDriveAdapter implements DriveAdapter {
  readonly mode = "live" as const;

  async listFolder(folderId: string | null): Promise<DriveListing> {
    const id = folderId ?? "root";
    const [folderRes, files] = await Promise.all([
      gfetch(`${API}/files/${encodeURIComponent(id)}?fields=id,name,parents&supportsAllDrives=true`),
      listAll(`'${escapeQ(id)}' in parents and trashed = false`),
    ]);
    const folder = (await folderRes.json()) as GFile;
    const crumbs: { id: string; name: string }[] = [{ id: folder.id, name: id === "root" ? "My Drive" : folder.name }];
    let parent = folder.parents?.[0];
    for (let i = 0; parent && i < 8; i++) {
      const r = await gfetch(`${API}/files/${encodeURIComponent(parent)}?fields=id,name,parents&supportsAllDrives=true`);
      const p = (await r.json()) as GFile;
      crumbs.unshift({ id: p.id, name: p.parents?.length ? p.name : "My Drive" });
      parent = p.parents?.[0];
    }
    const items = files.map(toItem).filter((f) => f.kind === "folder" || f.kind === "video" || f.kind === "audio");
    return { folder: { id: folder.id, name: crumbs[crumbs.length - 1].name }, breadcrumbs: crumbs, items };
  }

  async search(query: string, withinFolderId: string | null): Promise<DriveItem[]> {
    const q = query.trim();
    if (!q) return [];
    let expr = `name contains '${escapeQ(q)}' and trashed = false and (mimeType contains 'video/' or mimeType = '${FOLDER_MIME}')`;
    if (withinFolderId) expr += ` and '${escapeQ(withinFolderId)}' in parents`;
    return (await listAll(expr)).map(toItem);
  }

  async getFile(fileId: string): Promise<DriveItem> {
    const res = await gfetch(`${API}/files/${encodeURIComponent(fileId)}?fields=${FIELDS},trashed&supportsAllDrives=true`);
    const f = (await res.json()) as GFile & { trashed?: boolean };
    if (f.trashed) throw new AdapterError("not_found", "File is in the Drive trash.");
    return toItem(f);
  }

  async fetchContent(fileId: string, range: string | null): Promise<Response> {
    const res = await gfetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: range ? { Range: range } : {},
    });
    const headers = new Headers();
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set("Cache-Control", "private, no-store");
    return new Response(res.body, { status: res.status, headers });
  }

  async fetchThumbnail(fileId: string): Promise<Response> {
    const res = await gfetch(`${API}/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`);
    const { thumbnailLink } = (await res.json()) as { thumbnailLink?: string };
    if (!thumbnailLink) throw new AdapterError("not_found", "No thumbnail");
    const img = await fetch(thumbnailLink.replace(/=s\d+$/, "=s480"), {
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
    if (!img.ok) throw new AdapterError("not_found", "Thumbnail unavailable");
    return new Response(img.body, {
      headers: { "Content-Type": img.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  }

  async downloadTo(fileId: string, destPath: string): Promise<void> {
    const res = await gfetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    if (!res.body) throw new AdapterError("server_error", "Empty download");
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(destPath);
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream).pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
  }

  async uploadFile(localPath: string, name: string, folderId: string): Promise<DriveItem> {
    const size = fs.statSync(localPath).size;
    const init = await gfetch(`${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=${FIELDS}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({ name, parents: [folderId], mimeType: "video/mp4", appProperties: { balenaRole: "render" } }),
    });
    const location = init.headers.get("location");
    if (!location) throw new AdapterError("server_error", "Drive did not return an upload session");
    const res = await fetch(location, {
      method: "PUT",
      headers: { "Content-Length": String(size), "Content-Type": "video/mp4" },
      body: Readable.toWeb(fs.createReadStream(localPath)) as ReadableStream,
      // @ts-expect-error Node fetch requires duplex for streamed bodies
      duplex: "half",
    });
    if (!res.ok) throw new AdapterError(res.status >= 500 ? "server_error" : "invalid_request", `Drive upload failed (${res.status})`);
    return toItem((await res.json()) as GFile);
  }

  async ensureOutputFolder(name: string): Promise<{ id: string; name: string }> {
    // drive.file only sees folders this app created, so look for ours by appProperties.
    const existing = await listAll(
      `mimeType = '${FOLDER_MIME}' and trashed = false and appProperties has { key='balenaRole' and value='renders' }`,
    );
    if (existing[0]) return { id: existing[0].id, name: existing[0].name };
    const res = await gfetch(`${API}/files?fields=id,name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties: { balenaRole: "renders" } }),
    });
    return (await res.json()) as { id: string; name: string };
  }
}
