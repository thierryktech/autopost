import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { getSessionUser } from "@/server/auth";
import { finishOAuth } from "@/server/oauth";
import { upsertConnection } from "@/server/connections";
import { logActivity } from "@/server/services/activity";
import { FB_SCOPES } from "@/server/scopes";

const G = () => `https://graph.facebook.com/${env.graphApiVersion}`;

async function gget<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${G()}${path}?${new URLSearchParams(params)}`);
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Facebook error ${res.status}`);
  return json;
}

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.redirect(`${env.appUrl}/login`);
  const url = new URL(req.url);
  const back = (notice: string) => NextResponse.redirect(`${env.appUrl}/settings?notice=${notice}#integrations`);
  if (url.searchParams.get("error")) {
    await upsertConnection("facebook", { status: "permission_denied", lastError: "Facebook login was cancelled or permissions were declined." });
    return back("fb_denied");
  }
  try {
    await finishOAuth("facebook", url.searchParams.get("state"));
    const short = await gget<{ access_token: string }>("/oauth/access_token", {
      client_id: env.facebookAppId,
      client_secret: env.facebookAppSecret,
      redirect_uri: `${env.appUrl}/api/connect/facebook/callback`,
      code: url.searchParams.get("code") ?? "",
    });
    const long = await gget<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: env.facebookAppId,
      client_secret: env.facebookAppSecret,
      fb_exchange_token: short.access_token,
    });
    const perms = await gget<{ data: { permission: string; status: string }[] }>("/me/permissions", { access_token: long.access_token });
    const declined = FB_SCOPES.filter((s) => !perms.data.some((p) => p.permission === s && p.status === "granted"));
    const pages = await gget<{ data: { id: string; name: string; access_token: string; tasks?: string[] }[] }>("/me/accounts", {
      access_token: long.access_token,
      fields: "id,name,access_token,tasks",
    });
    if (!pages.data.length) {
      await upsertConnection("facebook", { status: "permission_denied", lastError: "No Facebook Pages were shared with Balena. Reconnect and select your Page." });
      return back("fb_no_pages");
    }
    const page = pages.data[0];
    await upsertConnection("facebook", {
      status: declined.length ? "permission_denied" : "connected",
      accountLabel: page.name,
      externalId: page.id,
      scopes: perms.data.filter((p) => p.status === "granted").map((p) => p.permission),
      lastError: declined.length ? `Missing permission: ${declined.join(", ")}` : null,
      lastCheckedAt: new Date(),
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
      // Page tokens derived from a long-lived user token do not expire by time, but are revoked if
      // the password changes or the app is removed — handled as "expired" on the next API error.
      tokens: { accessToken: long.access_token, pageAccessToken: page.access_token, pages: pages.data.map((p) => ({ id: p.id, name: p.name, token: p.access_token })) },
      meta: { pages: pages.data.map((p) => ({ id: p.id, name: p.name })) },
    });
    await logActivity({ category: "connection", level: declined.length ? "warning" : "success", title: `Facebook Page connected: ${page.name}`, detail: declined.length ? `Missing: ${declined.join(", ")}` : null });
    return back(declined.length ? "fb_partial" : "fb_connected");
  } catch (e) {
    console.error("[facebook] connect", e);
    await upsertConnection("facebook", { status: "error", lastError: (e as Error).message });
    return back("fb_failed");
  }
}
