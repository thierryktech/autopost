/*
 * DEMO DATA seeding. Runs once on an empty database so every screen can be reviewed before any
 * integration is enabled. Every seeded row is flagged isDemo and labelled in the UI.
 */
import { addDays, format } from "date-fns";
import { sql } from "drizzle-orm";
import type { Db } from "./db/connect";
import * as s from "./db/schema";
import { DEMO_CATALOG, DEMO_OUTPUT_FOLDER_ID, DEMO_SOURCE_FOLDER_ID } from "./adapters/drive/demo-catalog";
import { contentHash } from "@/lib/domain/approval";
import { DEFAULT_TZ, inTz, zonedToUtc } from "@/lib/time";

export const DEFAULT_SUBTITLE_STYLE: s.SubtitleStyle = {
  fontFamily: "Prompt",
  fontSizePx: 72,
  textColor: "#FFFFFF",
  outlineColor: "#1F3A3D",
  boxColor: null,
  position: "bottom",
};

export async function ensureSeeded(db: Db, opts: { demo?: boolean } = {}) {
  const existing = await db.select({ id: s.settings.id }).from(s.settings).limit(1);
  if (existing.length) return;
  const demo = opts.demo ?? process.env.SEED_DEMO_DATA !== "false";
  await db.transaction(async (tx) => {
    await tx.insert(s.settings).values({
      id: "default",
      timezone: DEFAULT_TZ,
      sourceFolderId: demo ? DEMO_SOURCE_FOLDER_ID : null,
      sourceFolderName: demo ? "Balena Footage" : null,
      outputFolderId: demo ? DEMO_OUTPUT_FOLDER_ID : null,
      outputFolderName: demo ? "Balena Reel Studio – Renders" : null,
    });
    await tx.insert(s.brandKit).values({
      id: "default",
      brandName: "BALENA",
      colors: [
        { name: "Deep teal", hex: "#2F5257" },
        { name: "Warm peach", hex: "#F3C9A8" },
        { name: "Roast brown", hex: "#6B4429" },
        { name: "Cream", hex: "#FBF6F0" },
      ],
      headingFont: "Prompt",
      bodyFont: "Noto Sans Thai",
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
      toneOfVoice:
        "อบอุ่น เป็นกันเอง เหมือนเจ้าของร้านคุยกับลูกค้าประจำ ประโยคสั้น อ่านง่าย ไม่โอ้อวด ใช้อีโมจิได้ไม่เกิน 1–2 ตัว",
      defaultCtas: ["สั่งได้ที่ลิงก์ในโพสต์เลยนะคะ", "แวะมาชิมที่ร้านได้ทุกวัน", "ทักแชทมาคุยเรื่องกาแฟกันได้เลย"],
      prohibitedClaims: ["ลดน้ำหนัก", "รักษาโรค", "ดีที่สุดในประเทศ", "ออร์แกนิก 100%", "ช่วยให้สุขภาพดี"],
    });
    if (!demo) return;

    const now = new Date();
    await tx.insert(s.connections).values([
      { provider: "google_drive", status: "demo", accountLabel: "Demo Drive (local files)", meta: { demo: true } },
      { provider: "facebook", status: "demo", accountLabel: "Demo Page (simulated)", meta: { demo: true } },
      { provider: "worker", status: "demo", accountLabel: "Embedded demo worker", meta: { demo: true } },
      { provider: "claude", status: "demo", accountLabel: "Demo template (not Claude)", meta: { demo: true } },
    ]);

    const files = DEMO_CATALOG.filter((n) => n.kind === "video");
    await tx.insert(s.footage).values(
      files.map((f) => ({
        id: `ftg_${f.id.replace("demo-", "")}`,
        driveFileId: f.id,
        driveFolderId: f.parentId,
        name: f.name,
        mimeType: "video/mp4",
        kind: "source" as const,
        durationMs: f.durationMs ?? null,
        width: f.width ?? null,
        height: f.height ?? null,
        availability: f.missing ? ("unavailable" as const) : ("available" as const),
        syncError: f.missing ? "File was removed from Drive or moved to the trash." : null,
        lastSyncedAt: now,
        isDemo: true,
      })),
    );

    await tx.insert(s.products).values([
      {
        id: "prd_house_blend",
        name: "House Blend",
        nameTh: "บาลีน่า เฮาส์เบลนด์ (เมล็ดกาแฟคั่วกลาง)",
        type: "own",
        imageUrl: null,
        verifiedFacts: ["เมล็ดกาแฟคั่วกลาง", "ถุงขนาด 250 กรัม", "คั่วที่ร้าน BALENA"],
        destinationUrl: "https://example.com/balena/house-blend",
        nativeTag: { eligibility: "unknown", catalogProductId: null, checkedAt: null, note: "Requires a Meta catalog + Shop; not verified." },
        isDemo: true,
      },
      {
        id: "prd_v60",
        name: "Pour-over dripper (affiliate)",
        nameTh: "ดริปเปอร์สำหรับดริปกาแฟ",
        type: "affiliate",
        imageUrl: null,
        verifiedFacts: ["ใช้กับกระดาษกรองทรงกรวย"],
        destinationUrl: "https://example.com/affiliate/dripper",
        nativeTag: {
          eligibility: "not_supported",
          catalogProductId: null,
          checkedAt: null,
          note: "Marketplace affiliate items (e.g. Shopee) cannot be natively tagged via the Reels publishing API.",
        },
        isDemo: true,
      },
    ]);

    const tz = DEFAULT_TZ;
    const day = (offset: number) => format(addDays(inTz(now, tz), offset), "yyyy-MM-dd");
    const brief = (purpose: string, style: s.CreativeBrief["style"], productId: string | null, dur = 20): s.CreativeBrief => ({
      purpose,
      targetDurationSec: dur,
      style,
      productId,
      music: { enabled: true, trackName: "morning_acoustic_demo.m4a", driveFileId: "demo-M001", volume: 0.5 },
      notes: "",
    });

    type SeedProject = {
      id: string;
      title: string;
      stage: s.ProjectStage;
      status: s.ProjectStatus;
      brief: s.CreativeBrief;
      caption: string;
      clips: [string, number, number][];
      subtitles: [number, number, string][];
      render?: boolean;
      approved?: boolean;
      changes?: string;
    };
    const projects: SeedProject[] = [
      {
        id: "prj_roasting_day",
        title: "Roasting day at BALENA",
        stage: "brief",
        status: "draft",
        brief: brief("ชวนดูเบื้องหลังวันคั่วกาแฟ", "behind_the_scenes", "prd_house_blend", 25),
        caption: "",
        clips: [["ftg_C001", 2000, 7000], ["ftg_C002", 3000, 10000], ["ftg_C003", 1000, 6000]],
        subtitles: [],
      },
      {
        id: "prj_slow_coffee",
        title: "Slow coffee, brighter days",
        stage: "review",
        status: "needs_review",
        brief: brief("ชวนดริปกาแฟช้าๆ ตอนเช้า", "calm", "prd_v60", 20),
        caption: "เช้านี้ขอช้าลงสักนิด\nดริปกาแฟแก้วโปรด แล้วค่อยเริ่มวันใหม่ ☕\nทักแชทมาคุยเรื่องกาแฟกันได้เลย",
        clips: [["ftg_C004", 2000, 8000], ["ftg_C005", 1000, 6000], ["ftg_C006", 3000, 10000]],
        subtitles: [[300, 4800, "เช้านี้ขอช้าลงสักนิด"], [5200, 10800, "รินน้ำให้กาแฟบลูม"], [11200, 17500, "แก้วนี้ทำให้ตัวเอง"]],
        render: true,
      },
      {
        id: "prj_iced_house_blend",
        title: "Iced coffee – House Blend",
        stage: "review",
        status: "approved",
        brief: brief("ชวนทำกาแฟเย็นจากเฮาส์เบลนด์", "energetic", "prd_house_blend", 18),
        caption:
          "กาแฟเย็นแก้วนี้\nเติมความสดชื่นให้วันธรรมดา\nด้วยบาลีน่า เฮาส์เบลนด์ เมล็ดกาแฟคั่วกลาง ☕\nสั่งได้ที่ลิงก์ในโพสต์เลยนะคะ",
        clips: [["ftg_C007", 1000, 7000], ["ftg_C008", 1000, 7000], ["ftg_C009", 1000, 6000]],
        subtitles: [[300, 5500, "กาแฟเย็นแก้วโปรด"], [6000, 11500, "นมลงไปช้าๆ"], [12000, 16500, "บาลีน่า เฮาส์เบลนด์"]],
        render: true,
        approved: true,
      },
      {
        id: "prj_morning_ritual",
        title: "Morning ritual",
        stage: "copy",
        status: "changes_requested",
        brief: brief("ชวนเริ่มเช้าวันใหม่กับกาแฟดริป", "cinematic", "prd_house_blend", 30),
        caption: "เริ่มเช้าวันใหม่\nกับกาแฟดี ๆ จากบาลีน่า\nคั่วด้วยความตั้งใจ\nในทุกแก้ว ☕",
        clips: [["ftg_C004", 0, 9000], ["ftg_C006", 2000, 12000], ["ftg_C005", 0, 8000]],
        subtitles: [[300, 6000, "เริ่มเช้าวันใหม่"], [6500, 14000, "กับกาแฟดี ๆ"], [14500, 26000, "คั่วด้วยความตั้งใจ"]],
        render: true,
        changes: "ขอซับไตเติลบรรทัดสุดท้ายให้สั้นลง และตัดช็อตกาต้มน้ำให้เร็วขึ้นหน่อย",
      },
    ];

    let ago = 60;
    for (const p of projects) {
      const createdAt = new Date(now.getTime() - ago-- * 3600_000);
      await tx.insert(s.projects).values({
        id: p.id,
        title: p.title,
        stage: p.stage,
        status: p.status,
        brief: p.brief,
        captionTh: p.caption,
        subtitles: p.subtitles.map(([a, b, t], i) => ({ id: `sub_${i + 1}`, startMs: a, endMs: b, text: t })),
        productId: p.brief.productId,
        isDemo: true,
        createdAt,
        updatedAt: createdAt,
      });
      await tx.insert(s.clipEdits).values(
        p.clips.map(([fid, a, b], i) => ({ id: `clp_${p.id}_${i}`, projectId: p.id, footageId: fid, position: i, inMs: a, outMs: b })),
      );
      if (p.render) {
        const renderId = `rnd_${p.id}_1`;
        const standIn = files.find((f) => `ftg_${f.id.replace("demo-", "")}` === p.clips[0][0])!;
        await tx.insert(s.renderVersions).values({
          id: renderId,
          projectId: p.id,
          versionNo: 1,
          status: "succeeded",
          editSnapshot: {
            clips: p.clips.map(([fid, a, b]) => ({ footageId: fid, driveFileId: `demo-${fid.slice(4)}`, name: fid, inMs: a, outMs: b })),
            subtitles: [],
            subtitleStyle: DEFAULT_SUBTITLE_STYLE,
            music: p.brief.music,
            logoUrl: null,
          },
          editHash: "seed",
          outputDriveFileId: standIn.id, // DEMO stand-in: plays the first source clip until you re-render
          durationMs: p.clips.reduce((sum, [, a, b]) => sum + (b - a), 0),
          progress: 100,
          isSimulated: true,
          startedAt: createdAt,
          finishedAt: createdAt,
          createdAt,
        });
        await tx.update(s.projects).set({ currentRenderId: renderId }).where(sql`${s.projects.id} = ${p.id}`);
        if (p.approved) {
          const hash = contentHash({ renderId, captionTh: p.caption, productId: p.brief.productId });
          await tx.insert(s.approvals).values({ id: `apr_${p.id}`, projectId: p.id, renderId, decision: "approved", contentHash: hash });
          await tx
            .update(s.projects)
            .set({ approvedRenderId: renderId, approvedContentHash: hash })
            .where(sql`${s.projects.id} = ${p.id}`);
        }
        if (p.changes) {
          await tx.insert(s.approvals).values({
            id: `apr_${p.id}`,
            projectId: p.id,
            renderId,
            decision: "changes_requested",
            contentHash: contentHash({ renderId, captionTh: p.caption, productId: p.brief.productId }),
            note: p.changes,
          });
        }
      }
    }

    await tx.insert(s.publishPlans).values([
      {
        id: "pln_iced_1",
        projectId: "prj_iced_house_blend",
        scheduledAt: zonedToUtc(day(2), "09:00", tz),
        timezone: tz,
        mode: "balena_publisher",
        status: "planned",
        idempotencyKey: "plan:pln_iced_1",
        isSimulated: true,
      },
      {
        id: "pln_slow_1",
        projectId: "prj_slow_coffee",
        scheduledAt: zonedToUtc(day(4), "10:00", tz),
        timezone: tz,
        mode: "balena_publisher",
        status: "awaiting_approval",
        idempotencyKey: "plan:pln_slow_1",
        isSimulated: true,
      },
    ]);

    const ev = (minsAgo: number, e: Omit<typeof s.activityEvents.$inferInsert, "id" | "at">) => ({
      id: `evt_seed_${minsAgo}`,
      at: new Date(now.getTime() - minsAgo * 60_000),
      ...e,
    });
    await tx.insert(s.activityEvents).values([
      ev(2900, { category: "drive", level: "success", title: "Demo Drive synced", detail: "9 clips found in “Balena Footage”." }),
      ev(2880, { category: "drive", level: "warning", title: "C010_shop_morning.mov is unavailable", detail: "The file was removed from Drive or moved to the trash. Restore it or remove it from projects.", action: { kind: "resync_drive" } }),
      ev(1500, { category: "editing", level: "info", title: "Draft created: Morning ritual", projectId: "prj_morning_ritual" }),
      ev(1400, { category: "rendering", level: "success", title: "Render v1 ready: Morning ritual", detail: "Demo stand-in video (not a real render).", projectId: "prj_morning_ritual" }),
      ev(1300, { category: "approval", level: "warning", title: "Changes requested: Morning ritual", detail: "ขอซับไตเติลบรรทัดสุดท้ายให้สั้นลง", projectId: "prj_morning_ritual" }),
      ev(900, { category: "rendering", level: "success", title: "Render v1 ready: Iced coffee – House Blend", detail: "Demo stand-in video (not a real render).", projectId: "prj_iced_house_blend" }),
      ev(880, { category: "approval", level: "success", title: "Approved: Iced coffee – House Blend", projectId: "prj_iced_house_blend" }),
      ev(870, { category: "publishing", level: "info", title: "Plan created (local): Iced coffee – House Blend", detail: "Not yet sent to Facebook.", projectId: "prj_iced_house_blend", planId: "pln_iced_1" }),
      ev(400, { category: "rendering", level: "success", title: "Render v1 ready: Slow coffee, brighter days", detail: "Demo stand-in video (not a real render).", projectId: "prj_slow_coffee" }),
    ]);
  });
}

/** Wipes all data and re-seeds the demo workspace (Settings → Reset demo data). */
export async function resetDemoData(db: Db) {
  await db.execute(
    sql`TRUNCATE activity_events, jobs, publish_attempts, publish_plans, approvals, render_versions, clip_edits, projects, products, footage, connections, brand_kit, settings`,
  );
  await ensureSeeded(db, { demo: true });
}
