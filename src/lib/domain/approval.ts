/*
 * Approval rules
 * --------------
 * An approval is bound to a content hash of (render version id + Thai caption + product).
 * Anything that changes what would be published — a new render, an edited caption or a
 * different product — changes the hash, so the earlier approval no longer applies and the
 * draft must be approved again. Publishing re-checks this at execution time.
 */
import { createHash } from "node:crypto";

export interface ApprovableContent {
  renderId: string | null;
  captionTh: string;
  productId: string | null;
}

export function normaliseCaption(caption: string): string {
  return caption.replace(/\r\n/g, "\n").trim();
}

export function contentHash(c: ApprovableContent): string {
  return createHash("sha256")
    .update(JSON.stringify([c.renderId ?? "", normaliseCaption(c.captionTh), c.productId ?? ""]))
    .digest("hex")
    .slice(0, 32);
}

export interface ApprovalState {
  approvedRenderId: string | null;
  approvedContentHash: string | null;
}

export function isApprovalValid(state: ApprovalState, current: ApprovableContent): boolean {
  if (!state.approvedRenderId || !state.approvedContentHash) return false;
  if (!current.renderId || current.renderId !== state.approvedRenderId) return false;
  return state.approvedContentHash === contentHash(current);
}

import type { ApprovalBlocker } from "./approval-labels";
export { BLOCKER_LABEL, type ApprovalBlocker } from "./approval-labels";

export function approvalBlockers(input: {
  state: ApprovalState;
  current: ApprovableContent;
  renderStatus: string | null;
}): ApprovalBlocker[] {
  const out: ApprovalBlocker[] = [];
  if (!input.current.renderId) out.push("no_render");
  else if (input.renderStatus !== "succeeded") out.push("render_not_ready");
  if (!normaliseCaption(input.current.captionTh)) out.push("empty_caption");
  if (!input.state.approvedContentHash) out.push("not_approved");
  else if (!isApprovalValid(input.state, input.current)) out.push("approval_stale");
  return out;
}
