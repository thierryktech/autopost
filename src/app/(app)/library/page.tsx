import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronRight, FolderOpen, RefreshCw, Link2Off, ShieldAlert, Clock } from "lucide-react";
import { getDb } from "@/server/db/connect";
import { footage } from "@/server/db/schema";
import { driveAdapter } from "@/server/adapters";
import { AdapterError, type DriveListing, type DriveItem } from "@/server/adapters/types";
import { getConnection } from "@/server/connections";
import { getSettings } from "@/server/services/overview";
import { PageHeader, EmptyState, Notice } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ConnectionBadge } from "@/components/status";
import { LibraryBrowser } from "./library-browser";
import { SyncButton, SetFolderButton } from "./library-actions";
import { ImportedList } from "./imported-list";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/cn";

export const metadata = { title: "Drive Library" };

type Tab = "browse" | "imported" | "rendered";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string; tab?: Tab }> }) {
  const sp = await searchParams;
  const tab: Tab = sp.tab ?? (sp.q ? "browse" : "browse");
  const [settings, conn] = await Promise.all([getSettings(), getConnection("google_drive")]);
  const db = await getDb();
  const drive = driveAdapter();
  const connected = conn && (conn.status === "connected" || conn.status === "demo");

  let listing: DriveListing | null = null;
  let results: DriveItem[] | null = null;
  let error: AdapterError | null = null;
  if (tab === "browse" && (connected || drive.mode === "demo")) {
    try {
      if (sp.q) results = await drive.search(sp.q, null);
      else listing = await drive.listFolder(sp.folder ?? settings?.sourceFolderId ?? null);
    } catch (e) {
      if (e instanceof AdapterError) error = e;
      else throw e;
    }
  }
  const imported = await db.select().from(footage);
  const importedByDrive = Object.fromEntries(imported.map((f) => [f.driveFileId, { id: f.id, kind: f.kind, availability: f.availability }]));

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "browse", label: "Browse Drive" },
    { key: "imported", label: "Source footage", count: imported.filter((f) => f.kind === "source").length },
    { key: "rendered", label: "Rendered output", count: imported.filter((f) => f.kind === "rendered").length },
  ];

  return (
    <div>
      <PageHeader
        title="Drive Library"
        description="Your footage stays in Google Drive. Balena keeps each file’s stable Drive ID and never moves or edits originals."
        actions={
          <>
            {conn && <ConnectionBadge status={conn.status} />}
            {connected && <SyncButton />}
          </>
        }
      />

      {!connected && drive.mode === "live" && (
        <ConnectionState status={conn?.status ?? "disconnected"} message={conn?.lastError ?? null} />
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <FolderTile label="Source folder" name={settings?.sourceFolderName} hint="New clips here are synced automatically." icon={<FolderOpen className="size-5" />} />
        <FolderTile label="Output folder (rendered Reels)" name={settings?.outputFolderName} hint="Created by Balena. Only rendered videos are written here." icon={<FolderOpen className="size-5" />} tone="peach" />
      </div>
      {conn?.lastCheckedAt && (
        <p className="-mt-1 mb-4 flex items-center gap-1.5 text-xs text-ink-500">
          <Clock className="size-3.5" aria-hidden /> Last synced {relativeTime(conn.lastCheckedAt)}
        </p>
      )}

      <nav aria-label="Library views" className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-[var(--shadow-card)] scrollbar-thin sm:w-fit">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/library?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-ink-600 hover:bg-teal-50", tab === t.key && "bg-teal-700 text-white hover:bg-teal-700")}
          >
            {t.label}
            {t.count != null && <span className={cn("rounded-full px-1.5 text-xs", tab === t.key ? "bg-white/20" : "bg-teal-50")}>{t.count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "browse" && (
        <>
          {error ? (
            error.code === "auth_expired" || error.code === "not_configured" ? (
              <ConnectionState status={error.code === "auth_expired" ? "expired" : "disconnected"} message={error.message} />
            ) : error.code === "permission_denied" ? (
              <ConnectionState status="permission_denied" message={error.message} />
            ) : (
              <Notice tone="danger" title="Couldn’t load this folder" action={<ButtonLink href="/library">Try again</ButtonLink>}>
                {error.message}
              </Notice>
            )
          ) : results ? (
            <LibraryBrowser
              mode="search"
              query={sp.q!}
              items={results}
              breadcrumbs={[]}
              imported={importedByDrive}
              sourceFolderId={settings?.sourceFolderId ?? null}
              outputFolderId={settings?.outputFolderId ?? null}
            />
          ) : listing ? (
            <>
              <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
                {listing.breadcrumbs.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="size-4 text-ink-400" aria-hidden />}
                    {i === listing!.breadcrumbs.length - 1 ? (
                      <span aria-current="page" className="px-2 py-2 font-semibold text-ink-900">{c.name}</span>
                    ) : (
                      <Link href={`/library?folder=${encodeURIComponent(c.id)}`} className="inline-flex min-h-11 items-center rounded-lg px-2 text-teal-700 hover:bg-white">
                        {c.name}
                      </Link>
                    )}
                  </span>
                ))}
                <span className="ml-auto flex flex-wrap gap-2">
                  {listing.folder.id !== settings?.sourceFolderId && <SetFolderButton folderId={listing.folder.id} folderName={listing.folder.name} />}
                </span>
              </nav>
              <LibraryBrowser
                mode="folder"
                items={listing.items}
                breadcrumbs={listing.breadcrumbs}
                imported={importedByDrive}
                sourceFolderId={settings?.sourceFolderId ?? null}
                outputFolderId={settings?.outputFolderId ?? null}
                currentFolderId={listing.folder.id}
              />
            </>
          ) : null}
        </>
      )}

      {tab !== "browse" && (
        <ImportedList
          items={imported
            .filter((f) => f.kind === (tab === "rendered" ? "rendered" : "source"))
            .sort((a, b) => (a.availability === "available" ? 1 : 0) - (b.availability === "available" ? 1 : 0) || a.name.localeCompare(b.name))}
          kind={tab === "rendered" ? "rendered" : "source"}
        />
      )}
    </div>
  );
}

function FolderTile({ label, name, hint, icon, tone = "teal" }: { label: string; name?: string | null; hint: string; icon: React.ReactNode; tone?: "teal" | "peach" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[var(--shadow-card)]">
      <span className={cn("flex size-10 items-center justify-center rounded-xl", tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-peach-100 text-peach-700")} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        <p className="truncate font-semibold text-ink-900">{name ?? "Not selected"}</p>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
    </div>
  );
}

function ConnectionState({ status, message }: { status: string; message: string | null }) {
  const map: Record<string, { title: string; body: string; icon: React.ReactNode; cta: string }> = {
    disconnected: { title: "Connect Google Drive", body: "Balena needs read access to browse your footage and permission to save rendered Reels into a folder it creates.", icon: <FolderOpen />, cta: "Connect Google Drive" },
    expired: { title: "Your Drive session expired", body: "Reconnect to continue syncing. Your drafts and library are safe.", icon: <Clock />, cta: "Reconnect Drive" },
    permission_denied: { title: "Drive permission denied", body: "Balena couldn’t read this folder. Reconnect and approve both requested permissions, or check the folder’s sharing settings.", icon: <ShieldAlert />, cta: "Reconnect Drive" },
    error: { title: "Drive connection error", body: "Something went wrong talking to Google Drive.", icon: <Link2Off />, cta: "Reconnect Drive" },
  };
  const s = map[status] ?? map.error;
  return (
    <EmptyState
      className="mb-5"
      icon={s.icon}
      title={s.title}
      description={<>{s.body}{message && <span className="mt-2 block text-xs text-ink-400">{message}</span>}</>}
      action={<ButtonLink href="/api/connect/google-drive/start" variant="primary" icon={<RefreshCw className="size-4" />}>{s.cta}</ButtonLink>}
    />
  );
}
