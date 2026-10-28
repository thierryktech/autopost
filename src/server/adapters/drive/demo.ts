import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "../../env";
import { AdapterError, type DriveAdapter, type DriveItem, type DriveListing } from "../types";
import { DEMO_CATALOG, DEMO_ROOT_ID, DEMO_OUTPUT_FOLDER_ID, type DemoNode } from "./demo-catalog";

/** DEMO adapter: serves the local fake Drive tree. Never talks to Google. */
export function demoDir() {
  return path.resolve(/*turbopackIgnore: true*/ env.dataDir, "demo-drive");
}
export function demoFilePath(id: string) {
  const node = DEMO_CATALOG.find((n) => n.id === id);
  const ext = node?.kind === "audio" ? "m4a" : "mp4";
  return path.join(demoDir(), "files", `${id}.${ext}`);
}
export function demoThumbPath(id: string) {
  return path.join(demoDir(), "thumbs", `${id}.jpg`);
}

interface UploadedNode extends DemoNode {
  sizeBytes: number;
  modifiedAt: string;
}

function uploadsFile() {
  return path.join(demoDir(), "uploads.json");
}
function readUploads(): UploadedNode[] {
  try {
    return JSON.parse(fs.readFileSync(uploadsFile(), "utf8")) as UploadedNode[];
  } catch {
    return [];
  }
}

function allNodes(): (DemoNode & { sizeBytes?: number; modifiedAt?: string })[] {
  return [...DEMO_CATALOG, ...readUploads()];
}

function toItem(n: DemoNode & { sizeBytes?: number; modifiedAt?: string }): DriveItem {
  const file = n.kind === "folder" ? null : n.id.startsWith("demo-R") ? uploadedPath(n.id) : demoFilePath(n.id);
  const exists = file ? fs.existsSync(file) : false;
  return {
    id: n.id,
    name: n.name,
    kind: n.kind,
    mimeType: n.kind === "folder" ? "application/vnd.google-apps.folder" : n.kind === "audio" ? "audio/mp4" : "video/mp4",
    parentId: n.parentId,
    durationMs: n.durationMs ?? null,
    width: n.width ?? null,
    height: n.height ?? null,
    sizeBytes: n.sizeBytes ?? (exists && file ? fs.statSync(file).size : null),
    modifiedAt: n.modifiedAt ?? "2026-10-20T02:00:00.000Z",
    md5: null,
    hasThumbnail: n.kind === "video",
  };
}

function uploadedPath(id: string) {
  return path.join(demoDir(), "files", `${id}.mp4`);
}

function breadcrumbs(folderId: string): { id: string; name: string }[] {
  const nodes = allNodes();
  const crumbs: { id: string; name: string }[] = [];
  let cur = nodes.find((n) => n.id === folderId);
  while (cur) {
    crumbs.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? nodes.find((n) => n.id === cur!.parentId) : undefined;
  }
  return crumbs;
}

function placeholderSvg(node: DemoNode | undefined): string {
  const [a, b] = node?.palette ?? ["#2f5257", "#e8c39e"];
  const label = (node?.name ?? "clip").replace(/\.[^.]+$/, "").replace(/[<&>]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 480" width="270" height="480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="270" height="480" fill="url(#g)"/>
<circle cx="135" cy="210" r="46" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/>
<path d="M120 190 L158 210 L120 230 Z" fill="rgba(255,255,255,.75)"/>
<text x="135" y="300" fill="#fff" font-family="sans-serif" font-size="16" text-anchor="middle" opacity=".9">${label}</text>
<text x="135" y="460" fill="#fff" font-family="sans-serif" font-size="12" text-anchor="middle" opacity=".7">DEMO</text></svg>`;
}

async function fileResponse(file: string, contentType: string, range: string | null): Promise<Response> {
  const stat = fs.statSync(file);
  const size = stat.size;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: { "Content-Type": contentType, "Content-Length": String(size), "Accept-Ranges": "bytes" },
  });
}

export class DemoDriveAdapter implements DriveAdapter {
  readonly mode = "demo" as const;

  async listFolder(folderId: string | null): Promise<DriveListing> {
    const id = folderId ?? DEMO_ROOT_ID;
    const nodes = allNodes();
    const folder = nodes.find((n) => n.id === id && n.kind === "folder");
    if (!folder) throw new AdapterError("not_found", "Folder not found in demo Drive");
    const items = nodes
      .filter((n) => n.parentId === id && !n.missing)
      .map(toItem)
      .sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || a.name.localeCompare(b.name));
    return { folder: { id: folder.id, name: folder.name }, breadcrumbs: breadcrumbs(id), items };
  }

  async search(query: string, withinFolderId: string | null): Promise<DriveItem[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const nodes = allNodes();
    const within = (n: DemoNode): boolean => {
      if (!withinFolderId) return true;
      let cur: DemoNode | undefined = n;
      while (cur) {
        if (cur.parentId === withinFolderId) return true;
        cur = nodes.find((x) => x.id === cur!.parentId);
      }
      return false;
    };
    return nodes.filter((n) => !n.missing && n.name.toLowerCase().includes(q) && within(n)).map(toItem);
  }

  async getFile(fileId: string): Promise<DriveItem> {
    const n = allNodes().find((x) => x.id === fileId);
    if (!n || n.missing) throw new AdapterError("not_found", "File is no longer in Drive (demo: deliberately missing)");
    return toItem(n);
  }

  async fetchContent(fileId: string, range: string | null): Promise<Response> {
    const n = allNodes().find((x) => x.id === fileId);
    if (!n || n.missing) throw new AdapterError("not_found", "File not found");
    const file = fileId.startsWith("demo-R") ? uploadedPath(fileId) : demoFilePath(fileId);
    if (!fs.existsSync(file)) throw new AdapterError("not_found", "Demo media not generated yet. Run `pnpm demo:media`.");
    return fileResponse(file, n.kind === "audio" ? "audio/mp4" : "video/mp4", range);
  }

  async fetchThumbnail(fileId: string): Promise<Response> {
    const thumb = demoThumbPath(fileId);
    if (fs.existsSync(thumb)) {
      return new Response(fs.readFileSync(thumb), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }
    const node = allNodes().find((x) => x.id === fileId);
    return new Response(placeholderSvg(node), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=60" } });
  }

  async downloadTo(fileId: string, destPath: string): Promise<void> {
    const n = allNodes().find((x) => x.id === fileId);
    const src = fileId.startsWith("demo-R") ? uploadedPath(fileId) : demoFilePath(fileId);
    if (!n || n.missing || !fs.existsSync(src)) throw new AdapterError("not_found", `Source file ${fileId} is unavailable`);
    await fs.promises.copyFile(src, destPath);
  }

  async uploadFile(localPath: string, name: string, folderId: string): Promise<DriveItem> {
    const id = `demo-R${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    fs.mkdirSync(path.join(demoDir(), "files"), { recursive: true });
    fs.mkdirSync(path.join(demoDir(), "thumbs"), { recursive: true });
    await fs.promises.copyFile(localPath, uploadedPath(id));
    const uploads = readUploads();
    const node: UploadedNode = {
      id,
      name,
      kind: "video",
      parentId: folderId || DEMO_OUTPUT_FOLDER_ID,
      sizeBytes: fs.statSync(localPath).size,
      modifiedAt: new Date().toISOString(),
      width: 1080,
      height: 1920,
      palette: ["#2f5257", "#f3c9a8"],
    };
    uploads.push(node);
    fs.writeFileSync(uploadsFile(), JSON.stringify(uploads, null, 2));
    return toItem(node);
  }

  async ensureOutputFolder(): Promise<{ id: string; name: string }> {
    const f = DEMO_CATALOG.find((n) => n.id === DEMO_OUTPUT_FOLDER_ID)!;
    return { id: f.id, name: f.name };
  }
}

/** Lets the render step store a thumbnail for uploaded demo renders. */
export function demoUploadThumbPath(id: string) {
  return demoThumbPath(id);
}
