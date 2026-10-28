import Link from "next/link";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { count } from "drizzle-orm";
import { getShellData, getSettings } from "@/server/services/overview";
import { getDb } from "@/server/db/connect";
import { products } from "@/server/db/schema";
import { env } from "@/server/env";
import { PageHeader, Notice } from "@/components/ui/misc";
import { DemoBadge } from "@/components/ui/badge";
import { FinishButton } from "./finish-button";
import { cn } from "@/lib/cn";

export const metadata = { title: "Setup" };

type StepState = "done" | "todo" | "attention" | "demo";

export default async function OnboardingPage() {
  const [shell, s] = await Promise.all([getShellData(), getSettings()]);
  const db = await getDb();
  const [[prod]] = await Promise.all([db.select({ n: count() }).from(products)]);
  const c = (p: string) => shell.connections.find((x) => x.provider === p);
  const st = (provider: string, mode: string): StepState => {
    const x = c(provider);
    if (mode === "demo") return "demo";
    if (!x || x.status === "disconnected") return "todo";
    return x.status === "connected" ? "done" : "attention";
  };
  const worker = c("worker");
  const workerFresh = worker?.lastCheckedAt && Date.now() - worker.lastCheckedAt.getTime() < 3 * 60_000;
  const steps: { title: string; body: string; state: StepState; href: string; cta: string }[] = [
    { title: "Sign in", body: env.authDisabled ? "Sign-in is disabled for local demo. Configure Google sign-in before deploying." : "You’re signed in with your allowed Google account.", state: env.authDisabled ? "demo" : "done", href: "/settings", cta: "Settings" },
    { title: "Connect Google Drive", body: "Read access to browse footage, plus permission to save renders in a folder Balena creates.", state: st("google_drive", env.driveMode), href: env.driveMode === "live" ? "/api/connect/google-drive/start" : "/settings#integrations", cta: "Connect Drive" },
    { title: "Choose your source folder", body: s.sourceFolderName ? `Using “${s.sourceFolderName}”.` : "Pick the Drive folder where you keep raw coffee footage.", state: s.sourceFolderId ? (env.driveMode === "demo" ? "demo" : "done") : "todo", href: "/library", cta: "Open Library" },
    { title: "Connect your Facebook Page", body: "Grants Balena permission to publish Reels to your Page.", state: st("facebook", env.facebookMode), href: env.facebookMode === "live" ? "/api/connect/facebook/start" : "/settings#integrations", cta: "Connect Facebook" },
    { title: "Start the editing worker", body: "Renders and scheduled publishing run on an always-on worker so they continue when your devices are off.", state: env.workerMode === "embedded" ? "demo" : workerFresh ? "done" : "attention", href: "/settings#integrations", cta: "Check worker" },
    { title: "Enable Claude (optional)", body: "Adds an Anthropic API key so Claude can suggest edits and Thai copy. API usage is billed separately from a Claude subscription.", state: env.claudeMode === "demo" ? "demo" : env.anthropicApiKey ? "done" : "attention", href: "/settings#integrations", cta: "Learn more" },
    { title: "Set up your Brand Kit and products", body: "Tone of voice, prohibited claims, subtitle style and verified product facts.", state: prod.n > 0 ? "done" : "todo", href: "/brand", cta: "Open Brand Kit" },
  ];
  const icon = (x: StepState) =>
    x === "done" ? <CheckCircle2 className="size-6 text-success-700" aria-label="Done" /> : x === "attention" ? <CircleAlert className="size-6 text-warning-700" aria-label="Needs attention" /> : x === "demo" ? <Circle className="size-6 text-peach-500" aria-label="Demo" /> : <Circle className="size-6 text-ink-300" aria-label="To do" />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Setup" title="Welcome to Balena Reel Studio" description="Everything works in demo mode first, so you can review every screen. Enable each real integration when you’re ready." />
      {shell.anyDemo && <Notice tone="demo" className="mb-5" title="Demo mode">Steps marked <DemoBadge /> use clearly labelled demo data or simulated services. Nothing is read from or posted to your real accounts.</Notice>}
      <ol className="space-y-3">
        {steps.map((x, idx) => (
          <li key={x.title} className={cn("flex items-start gap-4 rounded-[var(--radius-card)] border bg-white p-4 shadow-[var(--shadow-card)]", x.state === "attention" ? "border-warning-100" : "border-line")}>
            <span className="mt-0.5">{icon(x.state)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">{idx + 1}. {x.title} {x.state === "demo" && <DemoBadge className="ml-1" />}</p>
              <p className="mt-0.5 text-sm text-ink-600">{x.body}</p>
            </div>
            <Link href={x.href} className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-control)] border border-line-strong px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50">{x.cta}</Link>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex justify-end"><FinishButton done={shell.onboarded} /></div>
    </div>
  );
}
