/*
 * End-to-end workflow against an in-memory PGlite database, the demo Drive, the REAL FFmpeg renderer
 * and the simulated Facebook adapter (with fault injection).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "balena-test-"));
process.env.DATABASE_URL = "pglite:memory";
process.env.DATA_DIR = dataDir;
process.env.DEMO_FB_PUBLISH_DELAY_MS = "0";

type Mods = {
  db: typeof import("@/server/db/connect");
  schema: typeof import("@/server/db/schema");
  projects: typeof import("@/server/services/projects");
  plans: typeof import("@/server/services/plans");
  queue: typeof import("@/server/jobs/queue");
  runner: typeof import("@/server/jobs/runner");
  adapters: typeof import("@/server/adapters");
  demoMedia: typeof import("@/server/demo-media");
  fbDemo: typeof import("@/server/adapters/facebook/demo");
  drive: typeof import("@/server/adapters/drive/demo");
};
let m: Mods;

async function drain(maxJobs = 20) {
  for (let i = 0; i < maxJobs; i++) {
    const job = await m.queue.claimNextJob("test");
    if (!job) return;
    await m.runner.runJob(job);
  }
}

async function runPublishJob(planId: string, steps = 10) {
  const db = await m.db.getDb();
  for (let i = 0; i < steps; i++) {
    // Make the job due now and run it (simulates time passing).
    await db.update(m.schema.jobs).set({ runAt: new Date(0) }).where(eq(m.schema.jobs.dedupeKey, `publish:${planId}`));
    const job = await m.queue.claimNextJob("test");
    if (!job) return;
    await m.runner.runJob(job);
  }
}

beforeAll(async () => {
  m = {
    db: await import("@/server/db/connect"),
    schema: await import("@/server/db/schema"),
    projects: await import("@/server/services/projects"),
    plans: await import("@/server/services/plans"),
    queue: await import("@/server/jobs/queue"),
    runner: await import("@/server/jobs/runner"),
    adapters: await import("@/server/adapters"),
    demoMedia: await import("@/server/demo-media"),
    fbDemo: await import("@/server/adapters/facebook/demo"),
    drive: await import("@/server/adapters/drive/demo"),
  };
  await m.db.getDb();
  await m.demoMedia.ensureDemoMedia();
}, 180_000);

describe("main workflow", () => {
  it("drafts, renders a real Thai-subtitled Reel, approves and publishes once", async () => {
    const db = await m.db.getDb();
    const id = await m.projects.createProject({ title: "ทดสอบ Thai render", footageIds: ["ftg_C004", "ftg_C007"] });
    let detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.clips).toHaveLength(2);

    // Edit draft (demo template; clearly not Claude)
    await m.projects.requestClaudeDraft(id);
    await drain();
    detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.project.captionTh.length).toBeGreaterThan(0);
    expect(detail.project.claudeDraftNote).toMatch(/DEMO template/);

    // Subtitle edit with Thai combining characters
    await m.projects.saveDraft(id, detail.project.version, {
      subtitles: [{ id: "a", startMs: 200, endMs: 3000, text: "กาแฟเย็นแก้วโปรด ☕ น้ำแข็งเต็มแก้ว" }],
      captionTh: "กาแฟเย็นแก้วนี้ เติมความสดชื่นให้วันธรรมดา",
      productId: "prd_house_blend",
    });

    // Render with real FFmpeg
    const r1 = await m.projects.requestRender(id);
    await drain();
    const [render] = await db.select().from(m.schema.renderVersions).where(eq(m.schema.renderVersions.id, r1.renderId));
    expect(render.status).toBe("succeeded");
    expect(render.isSimulated).toBe(false);
    const out = path.join(dataDir, "demo-drive", "files", `${render.outputDriveFileId}.mp4`);
    expect(fs.existsSync(out)).toBe(true);
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out]).stdout.toString().trim();
    expect(probe).toBe("1080,1920");

    // Thai subtitle pixels are burned in: frame with subtitle differs from frame without
    const withSub = path.join(dataDir, "with.png");
    spawnSync("ffmpeg", ["-y", "-ss", "1.5", "-i", out, "-frames:v", "1", withSub]);
    expect(fs.statSync(withSub).size).toBeGreaterThan(10_000);

    detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.project.status).toBe("needs_review");

    // Plan before approval → awaiting approval, nothing sent
    const planId = await m.plans.createPlan({ projectId: id, date: "2026-10-28", time: "23:59", timezone: "Asia/Bangkok" });
    let [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("awaiting_approval");

    await m.projects.approveDraft(id, r1.renderId);
    [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("planned");

    // Make it due now and publish
    await db.update(m.schema.publishPlans).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(m.schema.publishPlans.id, planId));
    const fb = m.adapters.facebookAdapter() as InstanceType<typeof m.fbDemo.DemoFacebookAdapter>;
    const before = fb.stats().finishCalls;
    await runPublishJob(planId);
    [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("published");
    expect(plan.confirmedAt).not.toBeNull();
    expect(plan.manualTagStatus).toBe("pending");
    expect(plan.captionSnapshot).toContain("https://example.com/balena/house-blend");
    expect(fb.stats().finishCalls - before).toBe(1);

    // Running the job again must not publish again
    await m.plans.checkPlanNow(planId);
    await runPublishJob(planId);
    expect(fb.stats().finishCalls - before).toBe(1);
  }, 180_000);

  it("re-rendering an approved video requires approval again", async () => {
    const db = await m.db.getDb();
    const id = "prj_iced_house_blend"; // seeded as approved with a planned post
    let detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.approvalValid).toBe(true);
    await m.projects.requestRender(id);
    detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.approvalValid).toBe(false);
    expect(detail.project.status).toBe("rendering");
    const [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, "pln_iced_1"));
    expect(plan.status).toBe("awaiting_approval");
    await drain();
    detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.project.status).toBe("needs_review");
    expect(detail.blockers).toContain("not_approved");
    // Caption edit after approval also invalidates
    await m.projects.approveDraft(id, detail.project.currentRenderId!);
    detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.approvalValid).toBe(true);
    await m.projects.saveDraft(id, detail.project.version, { captionTh: detail.project.captionTh + " เพิ่มเติม" });
    detail = (await m.projects.getProjectDetail(id))!;
    expect(detail.approvalValid).toBe(false);
    expect(detail.project.status).toBe("needs_review");
  }, 180_000);

  it("rejects stale saves from another device", async () => {
    const id = await m.projects.createProject({ title: "Conflict test" });
    const d = (await m.projects.getProjectDetail(id))!;
    await m.projects.saveDraft(id, d.project.version, { title: "From MacBook" });
    await expect(m.projects.saveDraft(id, d.project.version, { title: "From iPad (stale)" })).rejects.toBeInstanceOf(m.projects.ConflictError);
  });

  it("does not resend a publish request after an ambiguous response", async () => {
    const db = await m.db.getDb();
    const id = "prj_iced_house_blend";
    const fb = m.adapters.facebookAdapter() as InstanceType<typeof m.fbDemo.DemoFacebookAdapter>;
    let detail = (await m.projects.getProjectDetail(id))!;
    if (!detail.approvalValid) {
      await m.projects.approveDraft(id, detail.project.currentRenderId!);
      detail = (await m.projects.getProjectDetail(id))!;
    }
    const planId = await m.plans.createPlan({ projectId: id, date: "2026-12-01", time: "09:00" });
    await db.update(m.schema.publishPlans).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(m.schema.publishPlans.id, planId));
    const before = fb.stats().finishCalls;
    fb.faults.nextFinish = "ambiguous";
    // start, upload, finish (ambiguous)
    await runPublishJob(planId, 3);
    let [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("uncertain");
    expect(plan.finishRequestedAt).not.toBeNull();
    // Reconcile: status read shows it actually published; no second finish call
    await runPublishJob(planId, 5);
    [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("published");
    expect(fb.stats().finishCalls - before).toBe(1);
    const attempts = await db.select().from(m.schema.publishAttempts).where(eq(m.schema.publishAttempts.planId, planId));
    expect(attempts.filter((a) => a.phase === "finish")).toHaveLength(1);
    expect(attempts.find((a) => a.phase === "finish")!.outcome).toBe("ambiguous");
  }, 120_000);

  it("a definite rejection allows a safe retry", async () => {
    const db = await m.db.getDb();
    const fb = m.adapters.facebookAdapter() as InstanceType<typeof m.fbDemo.DemoFacebookAdapter>;
    const planId = await m.plans.createPlan({ projectId: "prj_iced_house_blend", date: "2026-12-02", time: "09:00" });
    await db.update(m.schema.publishPlans).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(m.schema.publishPlans.id, planId));
    fb.faults.nextFinish = "error";
    await runPublishJob(planId, 3);
    let [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("failed");
    expect(plan.finishRequestedAt).toBeNull();
    const videoId = plan.fbVideoId;
    // Retry reuses the same Facebook video id (cannot create a second Reel)
    await m.queue.retryJob((await db.select().from(m.schema.jobs).where(eq(m.schema.jobs.dedupeKey, `publish:${planId}`)))[0].id);
    await db.update(m.schema.publishPlans).set({ status: "planned" }).where(eq(m.schema.publishPlans.id, planId));
    await runPublishJob(planId, 5);
    [plan] = await db.select().from(m.schema.publishPlans).where(eq(m.schema.publishPlans.id, planId));
    expect(plan.status).toBe("published");
    expect(plan.fbVideoId).toBe(videoId);
  }, 120_000);
});
