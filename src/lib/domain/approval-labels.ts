export type ApprovalBlocker = "no_render" | "render_not_ready" | "not_approved" | "approval_stale" | "empty_caption";

export const BLOCKER_LABEL: Record<ApprovalBlocker, string> = {
  no_render: "No rendered video yet",
  render_not_ready: "Latest render is not finished",
  not_approved: "Draft has not been approved",
  approval_stale: "Video, caption or product changed after approval — approve again",
  empty_caption: "Thai caption is empty",
};
