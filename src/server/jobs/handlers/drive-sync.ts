import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/connect";
import { footage, settings } from "../../db/schema";
import { driveAdapter } from "../../adapters";
import { AdapterError, type DriveItem } from "../../adapters/types";
import { setConnectionStatus } from "../../connections";
import { logActivity } from "../../services/activity";
import { newId } from "@/lib/ids";
import type { JobHandler } from "../types";

export async function upsertFootageFromDrive(items: DriveItem[], kind: "source" | "rendered" = "source") {
  const db = await getDb();
  const ids: string[] = [];
  for (const it of items) {
    if (it.kind !== "video") continue;
    const [existing] = await db.select().from(footage).where(eq(footage.driveFileId, it.id));
    const values = {
      name: it.name,
      mimeType: it.mimeType,
      driveFolderId: it.parentId,
      durationMs: it.durationMs,
      width: it.width,
      height: it.height,
      sizeBytes: it.sizeBytes,
      md5: it.md5,
      driveModifiedAt: it.modifiedAt ? new Date(it.modifiedAt) : null,
      availability: "available" as const,
      syncError: null,
      lastSyncedAt: new Date(),
    };
    if (existing) {
      await db.update(footage).set(values).where(eq(footage.id, existing.id));
      ids.push(existing.id);
    } else {
      const id = newId("ftg");
      await db.insert(footage).values({ id, driveFileId: it.id, kind, isDemo: driveAdapter().mode === "demo", ...values });
      ids.push(id);
    }
  }
  return ids;
}

export const driveSyncHandler: JobHandler = async (job) => {
  const db = await getDb();
  const [s] = await db.select().from(settings).limit(1);
  if (!s?.sourceFolderId) return { kind: "done", result: { skipped: "no source folder" } };
  const drive = driveAdapter();
  try {
    const seen: DriveItem[] = [];
    const queue: { id: string; depth: number }[] = [{ id: s.sourceFolderId, depth: 0 }];
    while (queue.length) {
      const { id, depth } = queue.shift()!;
      const listing = await drive.listFolder(id);
      for (const it of listing.items) {
        if (it.kind === "folder" && depth < 3) queue.push({ id: it.id, depth: depth + 1 });
        if (it.kind === "video") seen.push(it);
      }
    }
    await upsertFootageFromDrive(seen);
    // Check footage we know about but didn't see: moved elsewhere, deleted, or permission lost.
    const seenIds = new Set(seen.map((x) => x.id));
    const known = await db.select().from(footage).where(and(eq(footage.kind, "source"), inArray(footage.availability, ["available", "unavailable", "permission_denied"])));
    let missing = 0;
    for (const f of known) {
      if (seenIds.has(f.driveFileId)) continue;
      try {
        const it = await drive.getFile(f.driveFileId);
        await db.update(footage).set({ availability: "available", syncError: null, name: it.name, lastSyncedAt: new Date() }).where(eq(footage.id, f.id));
      } catch (e) {
        if (e instanceof AdapterError && (e.code === "not_found" || e.code === "permission_denied")) {
          missing++;
          await db
            .update(footage)
            .set({ availability: e.code === "not_found" ? "unavailable" : "permission_denied", syncError: e.message, lastSyncedAt: new Date() })
            .where(eq(footage.id, f.id));
        } else throw e;
      }
    }
    await setConnectionStatus("google_drive", drive.mode === "demo" ? "demo" : "connected");
    await logActivity({
      category: "drive",
      level: missing ? "warning" : "success",
      title: `Drive synced: ${seen.length} clips`,
      detail: missing ? `${missing} previously imported clip(s) are no longer available.` : null,
      jobId: job.id,
      action: missing ? { kind: "open_library" } : null,
    });
    return { kind: "done", result: { clips: seen.length, missing } };
  } catch (e) {
    if (e instanceof AdapterError && e.code === "auth_expired") {
      await logActivity({ category: "connection", level: "error", title: "Google Drive needs reconnecting", detail: e.message, action: { kind: "reconnect", provider: "google_drive" } });
      return { kind: "blocked", reason: e.message };
    }
    if (e instanceof AdapterError && e.code === "permission_denied") {
      await setConnectionStatus("google_drive", "permission_denied", e.message);
      await logActivity({ category: "connection", level: "error", title: "Drive permission denied", detail: e.message, action: { kind: "reconnect", provider: "google_drive" } });
      return { kind: "blocked", reason: e.message };
    }
    throw e;
  }
};
