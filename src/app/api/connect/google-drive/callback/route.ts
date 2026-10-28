import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/server/env";
import { getSessionUser, verifyGoogleIdToken } from "@/server/auth";
import { finishOAuth, exchangeGoogleCode } from "@/server/oauth";
import { upsertConnection } from "@/server/connections";
import { getDb } from "@/server/db/connect";
import { settings } from "@/server/db/schema";
import { driveAdapter } from "@/server/adapters";
import { enqueueJob } from "@/server/jobs/queue";
import { logActivity } from "@/server/services/activity";

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.redirect(`${env.appUrl}/login`);
  const url = new URL(req.url);
  const back = (notice: string) => NextResponse.redirect(`${env.appUrl}/settings?notice=${notice}#integrations`);
  if (url.searchParams.get("error")) {
    await upsertConnection("google_drive", { status: "permission_denied", lastError: "Access was not granted in the Google consent screen." });
    return back("drive_denied");
  }
  try {
    const { verifier, returnTo } = await finishOAuth("drive", url.searchParams.get("state"));
    const t = await exchangeGoogleCode(url.searchParams.get("code") ?? "", verifier, "/api/connect/google-drive/callback");
    const granted = (t.scope ?? "").split(" ");
    const missing = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"].filter((s) => !granted.includes(s));
    const email = t.id_token ? (await verifyGoogleIdToken(t.id_token)).email ?? null : null;
    await upsertConnection("google_drive", {
      status: missing.length ? "permission_denied" : "connected",
      accountLabel: email,
      scopes: granted,
      expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
      lastError: missing.length ? `Missing permission: ${missing.map((m) => m.split("/").pop()).join(", ")}. Reconnect and tick every box.` : null,
      lastCheckedAt: new Date(),
      tokens: { accessToken: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 },
      meta: {},
    });
    if (missing.length) return back("drive_partial");
    const folder = await driveAdapter().ensureOutputFolder("Balena Reel Studio – Renders");
    const db = await getDb();
    await db.update(settings).set({ outputFolderId: folder.id, outputFolderName: folder.name }).where(eq(settings.id, "default"));
    await logActivity({ category: "connection", level: "success", title: "Google Drive connected", detail: email ?? undefined });
    await enqueueJob({ type: "drive_sync", payload: {}, dedupeKey: `drive_sync:connect:${Date.now()}` });
    return NextResponse.redirect(`${env.appUrl}${returnTo}`);
  } catch (e) {
    console.error("[drive] connect", e);
    await upsertConnection("google_drive", { status: "error", lastError: (e as Error).message });
    return back("drive_failed");
  }
}
