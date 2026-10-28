import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

/* Shared helpers for OAuth state + PKCE, stored in short-lived httpOnly cookies. */
const STATE_COOKIE = "brs_oauth";

export function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function beginOAuth(purpose: string, returnTo = "/") {
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const jar = await cookies();
  jar.set(STATE_COOKIE, JSON.stringify({ state, verifier, purpose, returnTo }), {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return { state, challenge };
}

export async function finishOAuth(purpose: string, stateParam: string | null) {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!raw || !stateParam) throw new Error("Missing OAuth state. Please try again.");
  const saved = JSON.parse(raw) as { state: string; verifier: string; purpose: string; returnTo: string };
  if (saved.state !== stateParam || saved.purpose !== purpose) throw new Error("OAuth state mismatch. Please try again.");
  const returnTo = saved.returnTo.startsWith("/") && !saved.returnTo.startsWith("//") ? saved.returnTo : "/";
  return { verifier: saved.verifier, returnTo };
}

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function exchangeGoogleCode(code: string, verifier: string, redirectPath: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: `${env.appUrl}${redirectPath}`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? "Google token exchange failed");
  return json;
}
