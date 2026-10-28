import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/*
 * All timestamps are stored as timestamptz (UTC instants). They are rendered in the
 * user's selected timezone (default Asia/Bangkok) by src/lib/time.ts.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export type ConnectionProvider = "google_drive" | "facebook" | "worker" | "claude";
export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "expired"
  | "permission_denied"
  | "error"
  | "demo";

export const connections = pgTable("connections", {
  provider: text("provider").$type<ConnectionProvider>().primaryKey(),
  status: text("status").$type<ConnectionStatus>().notNull().default("disconnected"),
  accountLabel: text("account_label"),
  externalId: text("external_id"), // Google account sub, Facebook Page id, worker id
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  // AES-GCM encrypted token bundle (see src/server/crypto.ts). Never sent to the browser.
  encryptedTokens: text("encrypted_tokens"),
  expiresAt: ts("expires_at"),
  lastCheckedAt: ts("last_checked_at"),
  lastError: text("last_error"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export type FootageKind = "source" | "rendered";
export type FootageAvailability = "available" | "unavailable" | "permission_denied";

export const footage = pgTable(
  "footage",
  {
    id: text("id").primaryKey(),
    driveFileId: text("drive_file_id").notNull(),
    driveFolderId: text("drive_folder_id"),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    kind: text("kind").$type<FootageKind>().notNull().default("source"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    md5: text("md5"),
    driveModifiedAt: ts("drive_modified_at"),
    availability: text("availability").$type<FootageAvailability>().notNull().default("available"),
    syncError: text("sync_error"),
    lastSyncedAt: ts("last_synced_at"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("footage_drive_file_id_uq").on(t.driveFileId)],
);

export type ProjectStage = "footage" | "brief" | "copy" | "review";
export type ProjectStatus =
  | "draft"
  | "rendering"
  | "needs_review"
  | "changes_requested"
  | "approved"
  | "render_failed";

export interface CreativeBrief {
  purpose: string;
  targetDurationSec: number;
  style: "calm" | "energetic" | "cinematic" | "tutorial" | "behind_the_scenes";
  productId: string | null;
  music: { enabled: boolean; trackName: string | null; driveFileId: string | null; volume: number };
  notes: string;
}

export interface SubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    stage: text("stage").$type<ProjectStage>().notNull().default("footage"),
    status: text("status").$type<ProjectStatus>().notNull().default("draft"),
    brief: jsonb("brief").$type<CreativeBrief>().notNull(),
    captionTh: text("caption_th").notNull().default(""),
    subtitles: jsonb("subtitles").$type<SubtitleCue[]>().notNull().default([]),
    productId: text("product_id"),
    currentRenderId: text("current_render_id"),
    approvedRenderId: text("approved_render_id"),
    approvedContentHash: text("approved_content_hash"),
    claudeDraftNote: text("claude_draft_note"),
    // Optimistic concurrency: incremented on every save; stale saves are rejected.
    version: integer("version").notNull().default(1),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_status_idx").on(t.status)],
);

export const clipEdits = pgTable(
  "clip_edits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    footageId: text("footage_id")
      .notNull()
      .references(() => footage.id),
    position: integer("position").notNull(),
    inMs: integer("in_ms").notNull(),
    outMs: integer("out_ms").notNull(),
  },
  (t) => [index("clip_edits_project_idx").on(t.projectId)],
);

export type ProductType = "own" | "affiliate";
export type TagEligibility = "unknown" | "eligible" | "not_eligible" | "not_supported";

export interface NativeTagInfo {
  eligibility: TagEligibility;
  catalogProductId: string | null;
  checkedAt: string | null;
  note: string | null;
}

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameTh: text("name_th"),
  type: text("type").$type<ProductType>().notNull(),
  imageUrl: text("image_url"),
  verifiedFacts: jsonb("verified_facts").$type<string[]>().notNull().default([]),
  // A plain link (e.g. a Shopee affiliate URL). Separate from native Facebook product tags.
  destinationUrl: text("destination_url"),
  nativeTag: jsonb("native_tag")
    .$type<NativeTagInfo>()
    .notNull()
    .default({ eligibility: "unknown", catalogProductId: null, checkedAt: null, note: null }),
  archived: boolean("archived").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export interface SubtitleStyle {
  fontFamily: string;
  fontSizePx: number;
  textColor: string;
  outlineColor: string;
  boxColor: string | null;
  position: "bottom" | "middle";
}

export const brandKit = pgTable("brand_kit", {
  id: text("id").primaryKey().default("default"),
  brandName: text("brand_name").notNull().default("BALENA"),
  logoUrl: text("logo_url"),
  colors: jsonb("colors").$type<{ name: string; hex: string }[]>().notNull().default([]),
  headingFont: text("heading_font").notNull().default("Prompt"),
  bodyFont: text("body_font").notNull().default("Noto Sans Thai"),
  subtitleStyle: jsonb("subtitle_style").$type<SubtitleStyle>().notNull(),
  toneOfVoice: text("tone_of_voice").notNull().default(""),
  defaultCtas: jsonb("default_ctas").$type<string[]>().notNull().default([]),
  prohibitedClaims: jsonb("prohibited_claims").$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

export type RenderStatus = "queued" | "rendering" | "succeeded" | "failed" | "superseded";

export interface EditSnapshot {
  clips: { footageId: string; driveFileId: string; name: string; inMs: number; outMs: number }[];
  subtitles: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
  music: CreativeBrief["music"];
  logoUrl: string | null;
}

export const renderVersions = pgTable(
  "render_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    status: text("status").$type<RenderStatus>().notNull().default("queued"),
    editSnapshot: jsonb("edit_snapshot").$type<EditSnapshot>().notNull(),
    editHash: text("edit_hash").notNull(),
    outputFootageId: text("output_footage_id"),
    outputDriveFileId: text("output_drive_file_id"),
    durationMs: integer("duration_ms"),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    isSimulated: boolean("is_simulated").notNull().default(false),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("render_versions_project_version_uq").on(t.projectId, t.versionNo)],
);

export type ApprovalDecision = "approved" | "changes_requested" | "invalidated";

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    renderId: text("render_id"),
    decision: text("decision").$type<ApprovalDecision>().notNull(),
    // Hash of render id + caption + product: approval only holds while this matches.
    contentHash: text("content_hash").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_project_idx").on(t.projectId)],
);

export type PublishMode = "meta_scheduled" | "balena_publisher";

/*
 * Plan status is the *local* lifecycle. Facebook-side outcomes are tracked separately in
 * the fb* columns so "planned locally", "scheduled by Meta" and "published (confirmed)"
 * can never be confused.
 */
export type PlanStatus =
  | "planned" // local plan only, nothing sent to Meta
  | "awaiting_approval" // plan exists but the draft is not (or no longer) approved
  | "publishing" // worker is uploading / finishing
  | "scheduled_on_meta" // Meta confirmed a scheduled Reel
  | "published" // Meta confirmed publication
  | "uncertain" // a request may have succeeded; reconciling, no blind retry
  | "failed"
  | "cancelled";

export type FbStepStatus = "not_started" | "in_progress" | "succeeded" | "failed" | "unknown";

export const publishPlans = pgTable(
  "publish_plans",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scheduledAt: ts("scheduled_at").notNull(),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    mode: text("mode").$type<PublishMode>().notNull().default("balena_publisher"),
    status: text("status").$type<PlanStatus>().notNull().default("planned"),
    // Snapshots taken when the plan is handed to the publisher.
    renderId: text("render_id"),
    captionSnapshot: text("caption_snapshot"),
    approvalId: text("approval_id"),
    // Stable idempotency key for this plan; one plan can produce at most one Facebook video.
    idempotencyKey: text("idempotency_key").notNull(),
    fbVideoId: text("fb_video_id"),
    fbPostId: text("fb_post_id"),
    fbPermalink: text("fb_permalink"),
    fbUploadStatus: text("fb_upload_status").$type<FbStepStatus>().notNull().default("not_started"),
    fbProcessingStatus: text("fb_processing_status").$type<FbStepStatus>().notNull().default("not_started"),
    fbScheduleStatus: text("fb_schedule_status").$type<FbStepStatus>().notNull().default("not_started"),
    fbPublishStatus: text("fb_publish_status").$type<FbStepStatus>().notNull().default("not_started"),
    finishRequestedAt: ts("finish_requested_at"),
    confirmedAt: ts("confirmed_at"),
    manualTagStatus: text("manual_tag_status")
      .$type<"not_needed" | "pending" | "done_by_user">()
      .notNull()
      .default("not_needed"),
    lastError: text("last_error"),
    isSimulated: boolean("is_simulated").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("publish_plans_idem_uq").on(t.idempotencyKey),
    index("publish_plans_scheduled_idx").on(t.scheduledAt),
  ],
);

export const publishAttempts = pgTable("publish_attempts", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => publishPlans.id, { onDelete: "cascade" }),
  phase: text("phase").$type<"start" | "upload" | "finish" | "status_check">().notNull(),
  outcome: text("outcome").$type<"ok" | "error" | "ambiguous">().notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export type JobType = "render" | "publish" | "reconcile_publish" | "drive_sync" | "claude_draft";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<JobType>().notNull(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    runAt: ts("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedBy: text("locked_by"),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    // Prevents enqueueing the same logical job twice (e.g. two publish jobs for one plan).
    dedupeKey: text("dedupe_key"),
    projectId: text("project_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jobs_claim_idx").on(t.status, t.runAt),
    uniqueIndex("jobs_dedupe_uq").on(t.dedupeKey),
  ],
);

export type ActivityCategory = "editing" | "rendering" | "approval" | "publishing" | "connection" | "drive";
export type ActivityLevel = "info" | "success" | "warning" | "error";

export const activityEvents = pgTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    at: ts("at").notNull().defaultNow(),
    category: text("category").$type<ActivityCategory>().notNull(),
    level: text("level").$type<ActivityLevel>().notNull().default("info"),
    title: text("title").notNull(),
    detail: text("detail"),
    projectId: text("project_id"),
    planId: text("plan_id"),
    jobId: text("job_id"),
    // e.g. { kind: "retry_job", jobId } or { kind: "reconnect", provider }
    action: jsonb("action").$type<{ kind: string; [k: string]: unknown } | null>(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("activity_at_idx").on(t.at)],
);

export interface NotificationPrefs {
  renderFinished: boolean;
  needsReview: boolean;
  publishConfirmed: boolean;
  failures: boolean;
}

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  sourceFolderId: text("source_folder_id"),
  sourceFolderName: text("source_folder_name"),
  outputFolderId: text("output_folder_id"),
  outputFolderName: text("output_folder_name"),
  defaultPublishTime: text("default_publish_time").notNull().default("09:00"),
  defaultPublishMode: text("default_publish_mode").$type<PublishMode>().notNull().default("balena_publisher"),
  notifications: jsonb("notifications")
    .$type<NotificationPrefs>()
    .notNull()
    .default({ renderFinished: true, needsReview: true, publishConfirmed: true, failures: true }),
  calendarView: text("calendar_view").$type<"week" | "month" | "agenda">().notNull().default("week"),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  updatedAt: updatedAt(),
});

export type Footage = typeof footage.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ClipEdit = typeof clipEdits.$inferSelect;
export type Product = typeof products.$inferSelect;
export type BrandKit = typeof brandKit.$inferSelect;
export type RenderVersion = typeof renderVersions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type PublishPlan = typeof publishPlans.$inferSelect;
export type PublishAttempt = typeof publishAttempts.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Connection = typeof connections.$inferSelect;
