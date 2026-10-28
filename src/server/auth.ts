import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { env } from "./env";

/*
 * Single-user authentication.
 * - Sign in with Google (OpenID Connect, authorization-code + PKCE), restricted to ALLOWED_EMAIL.
 * - The session is a signed, httpOnly, SameSite=Lax cookie (HS256 with AUTH_SECRET), 30 days.
 * - Sign-in only asks for openid/email/profile. Drive access is a separate, explicit connection.
 */
export const SESSION_COOKIE = "brs_session";
const SESSION_TTL_S = 60 * 60 * 24 * 30;

export interface SessionUser {
  email: string;
  name: string | null;
  picture: string | null;
  demo: boolean;
}

function secret(): Uint8Array {
  const s = env.authSecret;
  if (!s) {
    if (env.isProduction) throw new Error("AUTH_SECRET is required in production");
    return new TextEncoder().encode("balena-dev-only-auth-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: Omit<SessionUser, "demo">): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .setSubject(user.email)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const email = String(payload.email ?? "").toLowerCase();
    if (!email || (env.allowedEmail && email !== env.allowedEmail)) return null;
    return { email, name: (payload.name as string) ?? null, picture: (payload.picture as string) ?? null, demo: false };
  } catch {
    return null;
  }
}

const DEMO_USER: SessionUser = { email: "demo@local", name: "Demo user", picture: null, demo: true };

export async function getSessionUser(): Promise<SessionUser | null> {
  if (env.authDisabled) return DEMO_USER;
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_S,
  };
}

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleIdToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.googleClientId,
  });
  return payload as { email?: string; email_verified?: boolean; name?: string; picture?: string; sub: string };
}
