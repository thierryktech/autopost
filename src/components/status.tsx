import { Badge, type Tone } from "./ui/badge";
import type { ConnectionStatus, PlanStatus, ProjectStatus, RenderStatus } from "@/server/db/schema";

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  rendering: { label: "Rendering", tone: "info" },
  needs_review: { label: "Needs review", tone: "peach" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  render_failed: { label: "Render failed", tone: "danger" },
};

export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: Tone; hint: string }> = {
  planned: { label: "Planned · local", tone: "teal", hint: "Saved in Balena only. Nothing has been sent to Facebook yet." },
  awaiting_approval: { label: "Needs approval", tone: "warning", hint: "Approve the current video and caption before it can be published." },
  publishing: { label: "Publishing…", tone: "info", hint: "The worker is uploading or finishing this Reel on Facebook." },
  scheduled_on_meta: { label: "Scheduled by Meta", tone: "info", hint: "Meta confirmed this Reel is scheduled. Publication is confirmed after the time passes." },
  published: { label: "Published", tone: "success", hint: "Facebook confirmed this Reel is live." },
  uncertain: { label: "Checking with Facebook", tone: "warning", hint: "A request may have succeeded. The app is confirming by reading status and will not post twice." },
  failed: { label: "Failed", tone: "danger", hint: "See the error and choose how to continue." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "This plan will not be published." },
};

export const RENDER_STATUS: Record<RenderStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  rendering: { label: "Rendering", tone: "info" },
  succeeded: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export const CONNECTION_STATUS: Record<ConnectionStatus, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "success" },
  disconnected: { label: "Not connected", tone: "neutral" },
  expired: { label: "Session expired", tone: "warning" },
  permission_denied: { label: "Permission denied", tone: "danger" },
  error: { label: "Error", tone: "danger" },
  demo: { label: "Demo mode", tone: "demo" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PlanStatusBadge({ status, simulated }: { status: PlanStatus; simulated?: boolean }) {
  const s = PLAN_STATUS[status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={s.tone}>{s.label}</Badge>
      {simulated && status !== "planned" && status !== "awaiting_approval" && status !== "cancelled" && <Badge tone="demo">Simulated</Badge>}
    </span>
  );
}

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const s = CONNECTION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
