import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { getSessionUser } from "@/server/auth";
import { beginOAuth, GOOGLE_AUTH_URL } from "@/server/oauth";
import { DRIVE_SCOPES } from "@/server/scopes";

/*
 * Google Drive connection (separate from sign-in). Least-privilege scopes for the folder workflow:
 *  - drive.readonly: browse/search folders and read source footage
 *  - drive.file:     create Balena's renders folder and upload rendered Reels into it
 */

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.redirect(`${env.appUrl}/login`);
  if (env.driveMode !== "live") return NextResponse.redirect(`${env.appUrl}/settings?notice=drive_demo#integrations`);
  if (!env.googleClientId || !env.googleClientSecret) return NextResponse.redirect(`${env.appUrl}/settings?notice=drive_not_configured#integrations`);
  const { state, challenge } = await beginOAuth("drive", "/library");
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: `${env.appUrl}/api/connect/google-drive/callback`,
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return NextResponse.redirect(url);
}
