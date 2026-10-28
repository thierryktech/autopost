import { getShellData, getSettings } from "@/server/services/overview";
import { readTokens } from "@/server/connections";
import { env } from "@/server/env";
import { ffmpegAvailable } from "@/server/adapters";
import { databaseKind } from "@/server/db/connect";
import { getSessionUser } from "@/server/auth";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const sp = await searchParams;
  const [shell, s, user, fbTokens] = await Promise.all([getShellData(), getSettings(), getSessionUser(), readTokens("facebook").catch(() => null)]);
  const conn = (p: string) => {
    const c = shell.connections.find((x) => x.provider === p);
    return c ? { status: c.status, accountLabel: c.accountLabel, lastError: c.lastError, lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null, scopes: c.scopes, externalId: c.externalId, meta: c.meta } : null;
  };
  return (
    <SettingsView
      notice={sp.notice ?? null}
      user={{ email: user?.email ?? "", demo: !!user?.demo }}
      settings={{
        timezone: s.timezone,
        defaultPublishTime: s.defaultPublishTime,
        defaultPublishMode: s.defaultPublishMode,
        notifications: s.notifications,
        sourceFolderName: s.sourceFolderName,
        outputFolderName: s.outputFolderName,
      }}
      integrations={{
        drive: { mode: env.driveMode, configured: !!(env.googleClientId && env.googleClientSecret), conn: conn("google_drive") },
        facebook: { mode: env.facebookMode, configured: !!(env.facebookAppId && env.facebookAppSecret), conn: conn("facebook"), pages: (fbTokens?.pages ?? []).map((p) => ({ id: p.id, name: p.name })), graphVersion: env.graphApiVersion },
        claude: { mode: env.claudeMode, configured: !!env.anthropicApiKey, model: env.claudeModel, conn: conn("claude") },
        worker: { mode: env.workerMode, ffmpeg: ffmpegAvailable(), render: shell.modes.render, conn: conn("worker") },
        database: databaseKind(),
        auth: env.authDisabled ? "disabled (local demo)" : "Google sign-in, single allowed account",
      }}
    />
  );
}
