import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { getSessionUser } from "@/server/auth";
import { beginOAuth } from "@/server/oauth";
import { FB_SCOPES } from "@/server/scopes";

/*
 * Facebook Login for Business → Page access token. Permissions requested (verify against current
 * Meta docs before going live): pages_show_list, pages_read_engagement, pages_manage_posts.
 */

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.redirect(`${env.appUrl}/login`);
  if (env.facebookMode !== "live") return NextResponse.redirect(`${env.appUrl}/settings?notice=fb_demo#integrations`);
  if (!env.facebookAppId || !env.facebookAppSecret) return NextResponse.redirect(`${env.appUrl}/settings?notice=fb_not_configured#integrations`);
  const { state } = await beginOAuth("facebook", "/settings#integrations");
  const url = new URL(`https://www.facebook.com/${env.graphApiVersion}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: env.facebookAppId,
    redirect_uri: `${env.appUrl}/api/connect/facebook/callback`,
    state,
    response_type: "code",
    scope: FB_SCOPES.join(","),
  }).toString();
  return NextResponse.redirect(url);
}
