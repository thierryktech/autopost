"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderOpen, Send, Bot, Server, Globe, Bell, Database, ShieldCheck, RotateCcw, Link2, Unlink, CheckCircle2, LogOut } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import type { ConnectionStatus, NotificationPrefs, PublishMode } from "@/server/db/schema";
import { PageHeader, Notice } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ConnectionBadge } from "@/components/status";
import { saveSettingsAction, disconnectAction, resetDemoDataAction, selectFacebookPageAction } from "@/app/actions";
import { COMMON_TIMEZONES, tzLabel, relativeTime } from "@/lib/time";

type Conn = { status: ConnectionStatus; accountLabel: string | null; lastError: string | null; lastCheckedAt: string | null; scopes: string[]; externalId: string | null; meta: Record<string, unknown> } | null;

interface Props {
  notice: string | null;
  user: { email: string; demo: boolean };
  settings: { timezone: string; defaultPublishTime: string; defaultPublishMode: PublishMode; notifications: NotificationPrefs; sourceFolderName: string | null; outputFolderName: string | null };
  integrations: {
    drive: { mode: "demo" | "live"; configured: boolean; conn: Conn };
    facebook: { mode: "demo" | "live"; configured: boolean; conn: Conn; pages: { id: string; name: string }[]; graphVersion: string };
    claude: { mode: "demo" | "live"; configured: boolean; model: string; conn: Conn };
    worker: { mode: "embedded" | "external"; ffmpeg: boolean; render: "ffmpeg" | "simulated"; conn: Conn };
    database: "pglite" | "postgres";
    auth: string;
  };
}

const NOTICES: Record<string, { tone: "info" | "warning" | "danger" | "success"; text: string }> = {
  drive_demo: { tone: "info", text: "Google Drive runs in demo mode. Set DRIVE_ADAPTER=google and Google OAuth credentials to connect your real Drive." },
  drive_not_configured: { tone: "warning", text: "Google OAuth isn’t configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
  drive_denied: { tone: "warning", text: "Google Drive access wasn’t granted." },
  drive_partial: { tone: "warning", text: "Some Drive permissions weren’t granted. Reconnect and allow both requested permissions." },
  drive_failed: { tone: "danger", text: "Connecting Google Drive failed. See the error below and try again." },
  fb_demo: { tone: "info", text: "Facebook runs in demo mode (simulated). Set FACEBOOK_ADAPTER=graph and your Meta app credentials to connect a real Page." },
  fb_not_configured: { tone: "warning", text: "Meta app credentials aren’t configured on the server (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)." },
  fb_denied: { tone: "warning", text: "Facebook login was cancelled or permissions were declined." },
  fb_partial: { tone: "warning", text: "Some Facebook permissions are missing. Reconnect and approve them all." },
  fb_no_pages: { tone: "warning", text: "No Pages were shared. Reconnect and select your BALENA Page." },
  fb_failed: { tone: "danger", text: "Connecting Facebook failed." },
  fb_connected: { tone: "success", text: "Facebook Page connected." },
};

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink-900">{label}</label>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
      <Switch.Root id={id} checked={checked} onCheckedChange={onChange} className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong data-[state=checked]:bg-teal-700">
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}

function IntegrationCard({ icon, title, mode, conn, children, actions, demoNote }: { icon: React.ReactNode; title: string; mode: string; conn: Conn; children?: React.ReactNode; actions?: React.ReactNode; demoNote?: string }) {
  const demo = mode === "demo" || mode === "embedded" || mode === "simulated";
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{title}</p>
          <p className="truncate text-sm text-ink-500">{conn?.accountLabel ?? "Not connected"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {demo ? <DemoBadge label={mode === "embedded" ? "Embedded (demo)" : mode === "simulated" ? "Simulated" : "Demo mode"} /> : <Badge tone="teal">Live</Badge>}
          {conn && !demo && <ConnectionBadge status={conn.status} />}
        </div>
      </div>
      {demo && demoNote && <p className="mt-3 rounded-xl bg-peach-50 px-3 py-2 text-xs text-peach-700">{demoNote}</p>}
      {conn?.lastError && <Notice tone={conn.status === "expired" ? "warning" : "danger"} className="mt-3">{conn.lastError}</Notice>}
      {children && <div className="mt-3 space-y-1 text-xs text-ink-600">{children}</div>}
      {conn?.lastCheckedAt && <p className="mt-2 text-xs text-ink-400">Last checked {relativeTime(conn.lastCheckedAt)}</p>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SettingsView(p: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(p.settings);
  const [resetOpen, setResetOpen] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(p.settings);
  const i = p.integrations;
  const notice = p.notice ? NOTICES[p.notice] : null;
  const allDemo = i.drive.mode === "demo" && i.facebook.mode === "demo";

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { tone: "success", message: msg } : { tone: "error", message: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });

  return (
    <div className="pb-24">
      <PageHeader title="Settings" description="Connections, folders, timezone and publishing defaults. Synced across your MacBook and iPad." actions={<ButtonLink href="/onboarding" variant="ghost">Setup guide</ButtonLink>} />
      {notice && <Notice tone={notice.tone} className="mb-5">{notice.text}</Notice>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card id="integrations" className="xl:col-span-2">
          <CardHeader title="Connections" description="Credentials stay on the server, encrypted. The browser never sees tokens or API keys." />
          <CardBody className="grid gap-3 md:grid-cols-2">
            <IntegrationCard
              icon={<FolderOpen className="size-5" />}
              title="Google Drive"
              mode={i.drive.mode}
              conn={i.drive.conn}
              demoNote="Using local demo files. Nothing is read from your Google account."
              actions={
                i.drive.mode === "live" ? (
                  <>
                    <ButtonLink href="/api/connect/google-drive/start" variant={i.drive.conn?.status === "connected" ? "secondary" : "primary"} icon={<Link2 className="size-4" />}>{i.drive.conn?.status === "connected" ? "Reconnect" : "Connect Google Drive"}</ButtonLink>
                    {i.drive.conn?.status === "connected" && <Button variant="danger" icon={<Unlink className="size-4" />} loading={pending} onClick={() => act(() => disconnectAction("google_drive"), "Drive disconnected")}>Disconnect</Button>}
                  </>
                ) : undefined
              }
            >
              <p>Permissions: <strong>read your Drive</strong> (browse folders & download footage) and <strong>files created by Balena</strong> (save rendered Reels into its own folder).</p>
              {i.drive.mode === "live" && !i.drive.configured && <p className="text-warning-700">Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.</p>}
            </IntegrationCard>

            <IntegrationCard
              icon={<Send className="size-5" />}
              title="Facebook Page"
              mode={i.facebook.mode}
              conn={i.facebook.conn}
              demoNote="Publishing is simulated. Nothing is posted to Facebook."
              actions={
                i.facebook.mode === "live" ? (
                  <>
                    <ButtonLink href="/api/connect/facebook/start" variant={i.facebook.conn?.status === "connected" ? "secondary" : "primary"} icon={<Link2 className="size-4" />}>{i.facebook.conn?.status === "connected" ? "Reconnect" : "Connect Facebook Page"}</ButtonLink>
                    {i.facebook.conn?.status === "connected" && <Button variant="danger" icon={<Unlink className="size-4" />} loading={pending} onClick={() => act(() => disconnectAction("facebook"), "Facebook disconnected")}>Disconnect</Button>}
                  </>
                ) : undefined
              }
            >
              <p>Permissions: pages_show_list, pages_read_engagement, pages_manage_posts (Graph API {i.facebook.graphVersion}).</p>
              {i.facebook.pages.length > 1 && (
                <div className="pt-2">
                  <Field label="Publish to Page">
                    {(id) => (
                      <Select id={id} value={i.facebook.conn?.externalId ?? ""} onChange={(e) => act(() => selectFacebookPageAction(e.target.value), "Page updated")}>
                        {i.facebook.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
                      </Select>
                    )}
                  </Field>
                </div>
              )}
              {i.facebook.mode === "live" && !i.facebook.configured && <p className="text-warning-700">Server is missing FACEBOOK_APP_ID / FACEBOOK_APP_SECRET.</p>}
            </IntegrationCard>

            <IntegrationCard icon={<Bot className="size-5" />} title="Claude (edit plans & Thai copy)" mode={i.claude.mode} conn={i.claude.conn} demoNote="Drafts come from a fixed template, not Claude. Set CLAUDE_ADAPTER=anthropic and ANTHROPIC_API_KEY to enable.">
              <p>Uses the Anthropic API (billed separately from a Claude subscription). Model: <code>{i.claude.model}</code>.</p>
              {i.claude.mode === "live" && !i.claude.configured && <p className="text-warning-700">Server is missing ANTHROPIC_API_KEY.</p>}
            </IntegrationCard>

            <IntegrationCard icon={<Server className="size-5" />} title="Editing worker" mode={i.worker.mode === "embedded" ? "embedded" : i.worker.render === "simulated" ? "simulated" : "live"} conn={i.worker.conn} demoNote="The job runner is embedded in this local server. It stops when the server stops — deploy the separate worker for scheduled publishing.">
              <p>Renderer: {i.worker.render === "ffmpeg" ? "FFmpeg" : "Simulated (FFmpeg not found)"}{i.worker.ffmpeg ? " · FFmpeg available on this server" : ""}.</p>
            </IntegrationCard>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<FolderOpen className="size-5" />} title="Folders" />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-ink-500">Source folder</span><span className="font-semibold">{form.sourceFolderName ?? "Not selected"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-ink-500">Output folder</span><span className="font-semibold">{form.outputFolderName ?? "Created on first render"}</span></div>
            <ButtonLink href="/library" variant="subtle">Choose source folder in Library</ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Globe className="size-5" />} title="Time & publishing defaults" />
          <CardBody className="space-y-4">
            <Field label="Timezone" hint={`Shown as ${tzLabel(form.timezone)}. All times are stored in UTC and displayed in this timezone.`}>
              {(id, d) => (
                <Select id={id} aria-describedby={d} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {[...new Set([form.timezone, ...COMMON_TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tzLabel(tz)} — {tz}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Default publish time">{(id) => <Input id={id} type="time" value={form.defaultPublishTime} onChange={(e) => setForm({ ...form, defaultPublishTime: e.target.value })} />}</Field>
            <Field label="Default publishing method">
              {(id) => (
                <Select id={id} value={form.defaultPublishMode} onChange={(e) => setForm({ ...form, defaultPublishMode: e.target.value as PublishMode })}>
                  <option value="balena_publisher">Balena publisher (worker publishes at the planned time)</option>
                  <option value="meta_scheduled">Schedule natively on Meta</option>
                </Select>
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Bell className="size-5" />} title="Notifications" description="Shown in Activity and the bell icon. Email/push delivery isn’t set up in this build." />
          <CardBody className="divide-y divide-line">
            <SwitchRow id="n1" label="Render finished" checked={form.notifications.renderFinished} onChange={(v) => setForm({ ...form, notifications: { ...form.notifications, renderFinished: v } })} />
            <SwitchRow id="n2" label="Draft needs review" checked={form.notifications.needsReview} onChange={(v) => setForm({ ...form, notifications: { ...form.notifications, needsReview: v } })} />
            <SwitchRow id="n3" label="Publication confirmed" checked={form.notifications.publishConfirmed} onChange={(v) => setForm({ ...form, notifications: { ...form.notifications, publishConfirmed: v } })} />
            <SwitchRow id="n4" label="Failures that need action" checked={form.notifications.failures} onChange={(v) => setForm({ ...form, notifications: { ...form.notifications, failures: v } })} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<ShieldCheck className="size-5" />} title="Account & data" />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-ink-500">Signed in as</span><span className="font-semibold">{p.user.demo ? "Local demo (sign-in disabled)" : p.user.email}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-ink-500">Authentication</span><span className="text-right">{i.auth}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-ink-500"><Database className="size-4" aria-hidden />Database</span><span>{i.database === "postgres" ? "Managed Postgres (shared across devices)" : <DemoBadge label="Local PGlite (this machine only)" />}</span></div>
            <div className="flex flex-wrap gap-2 pt-2">
              {!p.user.demo && <ButtonLink href="/api/auth/logout" variant="danger" icon={<LogOut className="size-4" />}>Sign out</ButtonLink>}
              {allDemo && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setResetOpen(true)}>Reset demo data</Button>}
            </div>
          </CardBody>
        </Card>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-pb md:left-[100px] lg:left-[244px]">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[var(--shadow-raised)]">
            <p className="mr-auto text-sm text-ink-700">Unsaved settings</p>
            <Button variant="ghost" onClick={() => setForm(p.settings)}>Discard</Button>
            <Button
              variant="primary"
              loading={pending}
              icon={<CheckCircle2 className="size-4" />}
              onClick={() => act(() => saveSettingsAction({ timezone: form.timezone, defaultPublishTime: form.defaultPublishTime, defaultPublishMode: form.defaultPublishMode, notifications: form.notifications }), "Settings saved")}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset demo data?"
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="danger" loading={pending} onClick={() => act(async () => { const r = await resetDemoDataAction(); setResetOpen(false); return r; }, "Demo data reset")}>Reset</Button></>}
      >
        <p className="text-sm text-ink-700">All drafts, plans, products and activity in this demo workspace are replaced with the original demo data.</p>
      </Dialog>
      <p className="mt-6 text-center text-xs text-ink-400"><Link href="/api/health" className="underline">Health check</Link></p>
    </div>
  );
}
