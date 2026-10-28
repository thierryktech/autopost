import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { beginOAuth, GOOGLE_AUTH_URL } from "@/server/oauth";

/** Sign in with Google: identity scopes only (openid email profile). */
export async function GET() {
  if (!env.googleClientId) return NextResponse.redirect(`${env.appUrl}/login?error=not_configured`);
  const { state, challenge } = await beginOAuth("login", "/");
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: `${env.appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(env.allowedEmail ? { login_hint: env.allowedEmail } : {}),
  }).toString();
  return NextResponse.redirect(url);
}
