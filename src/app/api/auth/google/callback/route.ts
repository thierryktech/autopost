import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { finishOAuth, exchangeGoogleCode } from "@/server/oauth";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE, verifyGoogleIdToken } from "@/server/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (code: string) => NextResponse.redirect(`${env.appUrl}/login?error=${code}`);
  if (url.searchParams.get("error")) return fail("denied");
  try {
    const { verifier, returnTo } = await finishOAuth("login", url.searchParams.get("state"));
    const tokens = await exchangeGoogleCode(url.searchParams.get("code") ?? "", verifier, "/api/auth/google/callback");
    if (!tokens.id_token) return fail("no_id_token");
    const claims = await verifyGoogleIdToken(tokens.id_token);
    const email = (claims.email ?? "").toLowerCase();
    if (!claims.email_verified || !env.allowedEmail || email !== env.allowedEmail) return fail("not_allowed");
    const token = await createSessionToken({ email, name: claims.name ?? null, picture: claims.picture ?? null });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
    return NextResponse.redirect(`${env.appUrl}${returnTo}`);
  } catch (e) {
    console.error("[auth] google callback", e);
    return fail("failed");
  }
}
