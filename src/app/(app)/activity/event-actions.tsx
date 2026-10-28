"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw, Link2, RefreshCw, Check, ArrowRight } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { retryJobAction, resolveEventAction, syncDriveAction } from "@/app/actions";

const CONNECT: Record<string, string> = {
  google_drive: "/api/connect/google-drive/start",
  facebook: "/api/connect/facebook/start",
  claude: "/settings#integrations",
};

export function EventActions({ eventId, action, resolvable }: { eventId: string; action: { kind: string; [k: string]: unknown } | null; resolvable: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { tone: "success", message: msg } : { tone: "error", message: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  const planId = typeof action?.planId === "string" ? action.planId : null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {action?.kind === "retry_job" && typeof action.jobId === "string" && (
        <Button loading={pending} icon={<RotateCcw className="size-4" />} onClick={() => run(() => retryJobAction(action.jobId as string, eventId), "Retry queued")}>Retry</Button>
      )}
      {action?.kind === "reconnect" && typeof action.provider === "string" && (
        <ButtonLink href={CONNECT[action.provider] ?? "/settings#integrations"} variant="primary" icon={<Link2 className="size-4" />}>Reconnect</ButtonLink>
      )}
      {action?.kind === "resync_drive" && <Button loading={pending} icon={<RefreshCw className="size-4" />} onClick={() => run(syncDriveAction, "Drive sync started")}>Sync Drive</Button>}
      {action?.kind === "open_library" && <ButtonLink href="/library?tab=imported" icon={<ArrowRight className="size-4" />}>Open library</ButtonLink>}
      {planId && ["manual_tag", "check_plan", "open_plan", "start_over", "edit_plan"].includes(action!.kind) && (
        <ButtonLink href={`/calendar?plan=${planId}`} variant={action!.kind === "manual_tag" ? "peach" : "secondary"} icon={<ArrowRight className="size-4" />}>
          {action!.kind === "manual_tag" ? "Add product tag" : action!.kind === "start_over" ? "Review & start over" : "Open plan"}
        </ButtonLink>
      )}
      {resolvable && <Button variant="ghost" loading={pending} icon={<Check className="size-4" />} onClick={() => run(() => resolveEventAction(eventId), "Marked as resolved")}>Mark resolved</Button>}
    </div>
  );
}
