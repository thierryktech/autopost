import { describe, expect, it } from "vitest";
import { approvalBlockers, contentHash, isApprovalValid } from "@/lib/domain/approval";
import { decidePublishStep, interpretStatus, type PlanForDecision } from "@/lib/domain/publish";
import { checkCopy } from "@/lib/domain/copy-guard";
import { buildAss, escapeAssText } from "@/lib/ass";

describe("approval invalidation", () => {
  const base = { renderId: "r1", captionTh: "กาแฟเย็นแก้วนี้", productId: "p1" };
  const state = { approvedRenderId: "r1", approvedContentHash: contentHash(base) };

  it("is valid only for the exact approved content", () => {
    expect(isApprovalValid(state, base)).toBe(true);
    expect(isApprovalValid(state, { ...base, renderId: "r2" })).toBe(false); // re-render
    expect(isApprovalValid(state, { ...base, captionTh: "แก้ไขแล้ว" })).toBe(false); // caption edit
    expect(isApprovalValid(state, { ...base, productId: null })).toBe(false); // product change
  });

  it("ignores insignificant whitespace", () => {
    expect(isApprovalValid(state, { ...base, captionTh: "  กาแฟเย็นแก้วนี้\r\n" })).toBe(true);
  });

  it("reports blockers", () => {
    expect(approvalBlockers({ state, current: { ...base, renderId: "r2" }, renderStatus: "succeeded" })).toEqual(["approval_stale"]);
    expect(approvalBlockers({ state: { approvedRenderId: null, approvedContentHash: null }, current: { ...base, captionTh: "" }, renderStatus: "rendering" })).toEqual([
      "render_not_ready",
      "empty_caption",
      "not_approved",
    ]);
  });
});

describe("publish state machine", () => {
  const now = new Date("2026-10-28T02:00:00Z");
  const plan = (p: Partial<PlanForDecision> = {}): PlanForDecision => ({
    status: "planned",
    mode: "balena_publisher",
    scheduledAt: new Date("2026-10-28T02:00:00Z"),
    fbVideoId: null,
    fbUploadStatus: "not_started",
    finishRequestedAt: null,
    fbPublishStatus: "not_started",
    fbScheduleStatus: "not_started",
    ...p,
  });

  it("requires approval before anything is sent", () => {
    expect(decidePublishStep(plan(), { now, approvalValid: false }).kind).toBe("blocked");
  });

  it("waits until the upload window, then start → upload → finish", () => {
    const later = plan({ scheduledAt: new Date("2026-10-29T02:00:00Z") });
    expect(decidePublishStep(later, { now, approvalValid: true }).kind).toBe("wait_until");
    expect(decidePublishStep(plan(), { now, approvalValid: true }).kind).toBe("start_upload");
    expect(decidePublishStep(plan({ fbVideoId: "v1", fbUploadStatus: "in_progress" }), { now, approvalValid: true }).kind).toBe("upload");
    expect(decidePublishStep(plan({ fbVideoId: "v1", fbUploadStatus: "succeeded" }), { now, approvalValid: true })).toEqual({ kind: "finish", videoState: "PUBLISHED" });
  });

  it("never resends finish once it was requested — even if approval is now invalid", () => {
    const sent = plan({ fbVideoId: "v1", fbUploadStatus: "succeeded", finishRequestedAt: now, status: "uncertain" });
    expect(decidePublishStep(sent, { now, approvalValid: true }).kind).toBe("reconcile");
    expect(decidePublishStep(sent, { now, approvalValid: false }).kind).toBe("reconcile");
  });

  it("uses SCHEDULED for meta-native mode only inside the window", () => {
    const m = plan({ mode: "meta_scheduled", fbVideoId: "v1", fbUploadStatus: "succeeded", scheduledAt: new Date("2026-10-29T02:00:00Z") });
    expect(decidePublishStep(m, { now, approvalValid: true })).toEqual({ kind: "finish", videoState: "SCHEDULED" });
    expect(decidePublishStep({ ...m, scheduledAt: new Date("2026-10-28T02:05:00Z") }, { now, approvalValid: true }).kind).toBe("blocked");
  });

  it("only reports published when Facebook confirms", () => {
    const ctx = { finishRequestedAt: now, now, mode: "balena_publisher" as const };
    const base = { uploading: "complete", processing: "complete", postId: null, permalink: null, errorMessage: null } as const;
    expect(interpretStatus({ ...base, publishing: "in_progress", publishStatus: "not_published" }, ctx).kind).toBe("pending");
    expect(interpretStatus({ ...base, publishing: "complete", publishStatus: "published" }, ctx).kind).toBe("published");
    expect(interpretStatus({ ...base, publishing: "complete", publishStatus: "scheduled" }, ctx).kind).toBe("scheduled_on_meta");
    expect(interpretStatus({ ...base, processing: "error", publishing: "not_started", publishStatus: "not_published" }, ctx)).toMatchObject({ kind: "failed", safeToStartOver: true });
    expect(
      interpretStatus({ ...base, publishing: "not_started", publishStatus: "not_published" }, { ...ctx, now: new Date(now.getTime() + 7 * 3600_000) }).kind,
    ).toBe("needs_attention");
  });
});

describe("Thai copy guard", () => {
  const opts = { prohibitedClaims: ["ลดน้ำหนัก"], verifiedFacts: ["ถุงขนาด 250 กรัม"] };
  it("flags prohibited, price, health and unverified numbers", () => {
    const w = checkCopy("กาแฟช่วยลดน้ำหนัก ราคา 199 บาท", opts).map((x) => x.kind);
    expect(w).toContain("prohibited_claim");
    expect(w).toContain("price");
    expect(w).toContain("health");
  });
  it("accepts verified facts", () => {
    expect(checkCopy("เฮาส์เบลนด์ ถุงขนาด 250 กรัม ☕", opts)).toEqual([]);
  });
});

describe("ASS subtitles", () => {
  it("escapes control characters and keeps Thai text intact", () => {
    expect(escapeAssText("เริ่ม{เช้า}\nวันใหม่")).toBe("เริ่ม\\{เช้า\\}\\Nวันใหม่");
    const ass = buildAss([{ id: "1", startMs: 1500, endMs: 3250, text: "กาแฟเย็นแก้วโปรด" }], {
      fontFamily: "Prompt", fontSizePx: 64, textColor: "#FFFFFF", outlineColor: "#1F3A3D", boxColor: null, position: "bottom",
    });
    expect(ass).toContain("Dialogue: 0,0:00:01.50,0:00:03.25,Default,,0,0,0,,กาแฟเย็นแก้วโปรด");
    expect(ass).toContain("Style: Default,Prompt,64,&H00FFFFFF");
  });
});
