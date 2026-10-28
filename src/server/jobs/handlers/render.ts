import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/connect";
import { footage, projects, renderVersions, settings } from "../../db/schema";
import { driveAdapter, renderAdapter } from "../../adapters";
import { AdapterError } from "../../adapters/types";
import { demoUploadThumbPath } from "../../adapters/drive/demo";
import { logActivity } from "../../services/activity";
import { newId } from "@/lib/ids";
import type { JobHandler } from "../types";

function slug(s: string) {
  return s.normalize("NFKD").replace(/[^\w฀-๿]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "reel";
}

export const renderHandler: JobHandler = async (job) => {
  const renderId = String(job.payload.renderId);
  const db = await getDb();
  const [render] = await db.select().from(renderVersions).where(eq(renderVersions.id, renderId));
  if (!render) return { kind: "done", result: { skipped: "missing" } };
  if (render.status === "superseded" || render.status === "succeeded") return { kind: "done", result: { skipped: render.status } };
  const [project] = await db.select().from(projects).where(eq(projects.id, render.projectId));
  if (!project) return { kind: "done", result: { skipped: "project deleted" } };

  await db.update(renderVersions).set({ status: "rendering", startedAt: new Date(), progress: 0, error: null }).where(eq(renderVersions.id, renderId));
  if (project.currentRenderId === renderId) await db.update(projects).set({ status: "rendering" }).where(eq(projects.id, project.id));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `balena-${renderId}-`));
  const drive = driveAdapter();
  try {
    const snap = render.editSnapshot;
    const clipPaths: string[] = [];
    for (const [i, c] of snap.clips.entries()) {
      const p = path.join(work, `clip${i}${path.extname(c.name) || ".mp4"}`);
      try {
        await drive.downloadTo(c.driveFileId, p);
      } catch (e) {
        if (e instanceof AdapterError && (e.code === "not_found" || e.code === "permission_denied")) {
          await db
            .update(footage)
            .set({ availability: e.code === "not_found" ? "unavailable" : "permission_denied", syncError: e.message })
            .where(eq(footage.id, c.footageId));
          throw new AdapterError(e.code, `Clip “${c.name}” is unavailable in Drive: ${e.message}`, false, false);
        }
        throw e;
      }
      clipPaths.push(p);
    }
    let musicPath: string | null = null;
    if (snap.music.enabled && snap.music.driveFileId) {
      musicPath = path.join(work, "music.m4a");
      await drive.downloadTo(snap.music.driveFileId, musicPath);
    }
    let logoPath: string | null = null;
    const m = snap.logoUrl ? /^data:image\/(png|jpeg);base64,(.+)$/.exec(snap.logoUrl) : null;
    if (m) {
      logoPath = path.join(work, `logo.${m[1] === "png" ? "png" : "jpg"}`);
      fs.writeFileSync(logoPath, Buffer.from(m[2], "base64"));
    }

    const outPath = path.join(work, "out.mp4");
    let lastWrite = 0;
    const result = await renderAdapter().render({
      snapshot: snap,
      clipPaths,
      musicPath,
      logoPath,
      outPath,
      onProgress: (pct) => {
        const now = Date.now();
        if (now - lastWrite > 1500 || pct >= 100) {
          lastWrite = now;
          void db.update(renderVersions).set({ progress: pct }).where(eq(renderVersions.id, renderId));
        }
      },
    });

    let outputDriveFileId: string | null = null;
    let outputFootageId: string | null = null;
    if (!result.simulated) {
      const [s] = await db.select().from(settings).limit(1);
      const folder = s?.outputFolderId ? { id: s.outputFolderId } : await drive.ensureOutputFolder("Balena Reel Studio – Renders");
      if (!s?.outputFolderId) await db.update(settings).set({ outputFolderId: folder.id, outputFolderName: "Balena Reel Studio – Renders" });
      const uploaded = await drive.uploadFile(outPath, `${slug(project.title)}_v${render.versionNo}.mp4`, folder.id);
      outputDriveFileId = uploaded.id;
      if (drive.mode === "demo") {
        const thumb = demoUploadThumbPath(uploaded.id);
        spawnSync(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH ?? "ffmpeg", ["-y", "-ss", "1", "-i", outPath, "-frames:v", "1", "-vf", "scale=360:-2", thumb], { stdio: "ignore" });
      }
      outputFootageId = newId("ftg");
      await db.insert(footage).values({
        id: outputFootageId,
        driveFileId: uploaded.id,
        driveFolderId: folder.id,
        name: uploaded.name,
        mimeType: "video/mp4",
        kind: "rendered",
        durationMs: result.durationMs,
        width: 1080,
        height: 1920,
        sizeBytes: uploaded.sizeBytes,
        lastSyncedAt: new Date(),
        isDemo: drive.mode === "demo",
      });
    }
    await db
      .update(renderVersions)
      .set({
        status: "succeeded",
        progress: 100,
        finishedAt: new Date(),
        durationMs: result.durationMs,
        outputDriveFileId,
        outputFootageId,
        isSimulated: result.simulated,
      })
      .where(eq(renderVersions.id, renderId));
    const [fresh] = await db.select().from(projects).where(eq(projects.id, project.id));
    if (fresh?.currentRenderId === renderId) await db.update(projects).set({ status: "needs_review", updatedAt: new Date() }).where(eq(projects.id, project.id));
    await logActivity({
      category: "rendering",
      level: "success",
      title: `Render v${render.versionNo} ready: ${project.title}`,
      detail: result.simulated ? "SIMULATED render (FFmpeg unavailable) — no real video was produced." : "Saved to the Drive renders folder. Ready for review.",
      projectId: project.id,
      jobId: job.id,
    });
    return { kind: "done", result: { outputDriveFileId, simulated: result.simulated } };
  } catch (e) {
    const msg = (e as Error).message;
    const retryable = e instanceof AdapterError && e.retryable && job.attempts < job.maxAttempts;
    if (!retryable) {
      await db.update(renderVersions).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(renderVersions.id, renderId));
      const [fresh] = await db.select().from(projects).where(eq(projects.id, project.id));
      if (fresh?.currentRenderId === renderId) await db.update(projects).set({ status: "render_failed" }).where(eq(projects.id, project.id));
      await logActivity({
        category: "rendering",
        level: "error",
        title: `Render v${render.versionNo} failed: ${project.title}`,
        detail: msg,
        projectId: project.id,
        jobId: job.id,
        action: { kind: "retry_job", jobId: job.id },
      });
    }
    throw e;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
};
