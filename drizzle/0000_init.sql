CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"project_id" text,
	"plan_id" text,
	"job_id" text,
	"action" jsonb,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"render_id" text,
	"decision" text NOT NULL,
	"content_hash" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kit" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"brand_name" text DEFAULT 'BALENA' NOT NULL,
	"logo_url" text,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"heading_font" text DEFAULT 'Prompt' NOT NULL,
	"body_font" text DEFAULT 'Noto Sans Thai' NOT NULL,
	"subtitle_style" jsonb NOT NULL,
	"tone_of_voice" text DEFAULT '' NOT NULL,
	"default_ctas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prohibited_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_edits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"footage_id" text NOT NULL,
	"position" integer NOT NULL,
	"in_ms" integer NOT NULL,
	"out_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"provider" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"account_label" text,
	"external_id" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"encrypted_tokens" text,
	"expires_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "footage" (
	"id" text PRIMARY KEY NOT NULL,
	"drive_file_id" text NOT NULL,
	"drive_folder_id" text,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"kind" text DEFAULT 'source' NOT NULL,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"md5" text,
	"drive_modified_at" timestamp with time zone,
	"availability" text DEFAULT 'available' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"dedupe_key" text,
	"project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_th" text,
	"type" text NOT NULL,
	"image_url" text,
	"verified_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"destination_url" text,
	"native_tag" jsonb DEFAULT '{"eligibility":"unknown","catalogProductId":null,"checkedAt":null,"note":null}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"stage" text DEFAULT 'footage' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"brief" jsonb NOT NULL,
	"caption_th" text DEFAULT '' NOT NULL,
	"subtitles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_id" text,
	"current_render_id" text,
	"approved_render_id" text,
	"approved_content_hash" text,
	"claude_draft_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"phase" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"mode" text DEFAULT 'balena_publisher' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"render_id" text,
	"caption_snapshot" text,
	"approval_id" text,
	"idempotency_key" text NOT NULL,
	"fb_video_id" text,
	"fb_post_id" text,
	"fb_permalink" text,
	"fb_upload_status" text DEFAULT 'not_started' NOT NULL,
	"fb_processing_status" text DEFAULT 'not_started' NOT NULL,
	"fb_schedule_status" text DEFAULT 'not_started' NOT NULL,
	"fb_publish_status" text DEFAULT 'not_started' NOT NULL,
	"finish_requested_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"manual_tag_status" text DEFAULT 'not_needed' NOT NULL,
	"last_error" text,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"edit_snapshot" jsonb NOT NULL,
	"edit_hash" text NOT NULL,
	"output_footage_id" text,
	"output_drive_file_id" text,
	"duration_ms" integer,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"source_folder_id" text,
	"source_folder_name" text,
	"output_folder_id" text,
	"output_folder_name" text,
	"default_publish_time" text DEFAULT '09:00' NOT NULL,
	"default_publish_mode" text DEFAULT 'balena_publisher' NOT NULL,
	"notifications" jsonb DEFAULT '{"renderFinished":true,"needsReview":true,"publishConfirmed":true,"failures":true}'::jsonb NOT NULL,
	"calendar_view" text DEFAULT 'week' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_edits" ADD CONSTRAINT "clip_edits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_edits" ADD CONSTRAINT "clip_edits_footage_id_footage_id_fk" FOREIGN KEY ("footage_id") REFERENCES "public"."footage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_attempts" ADD CONSTRAINT "publish_attempts_plan_id_publish_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."publish_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_plans" ADD CONSTRAINT "publish_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_versions" ADD CONSTRAINT "render_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "approvals_project_idx" ON "approvals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "clip_edits_project_idx" ON "clip_edits" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "footage_drive_file_id_uq" ON "footage" USING btree ("drive_file_id");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_uq" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_plans_idem_uq" ON "publish_plans" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "publish_plans_scheduled_idx" ON "publish_plans" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "render_versions_project_version_uq" ON "render_versions" USING btree ("project_id","version_no");