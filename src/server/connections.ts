import { eq } from "drizzle-orm";
import { getDb } from "./db/connect";
import { connections, type ConnectionProvider, type ConnectionStatus, type Connection } from "./db/schema";
import { encryptJson, decryptJson } from "./crypto";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null; // epoch ms
  /** Facebook: long-lived Page access token for the selected Page. */
  pageAccessToken?: string | null;
}

export async function getConnection(provider: ConnectionProvider): Promise<Connection | null> {
  const db = await getDb();
  const [row] = await db.select().from(connections).where(eq(connections.provider, provider));
  return row ?? null;
}

export async function upsertConnection(
  provider: ConnectionProvider,
  patch: Partial<Omit<Connection, "provider" | "encryptedTokens">> & { tokens?: OAuthTokens | null },
) {
  const db = await getDb();
  const { tokens, ...rest } = patch;
  const values: Partial<Connection> = { ...rest, updatedAt: new Date() };
  if (tokens !== undefined) values.encryptedTokens = tokens ? encryptJson(tokens) : null;
  await db
    .insert(connections)
    .values({ provider, ...values } as typeof connections.$inferInsert)
    .onConflictDoUpdate({ target: connections.provider, set: values });
}

export async function readTokens(provider: ConnectionProvider): Promise<OAuthTokens | null> {
  const c = await getConnection(provider);
  if (!c?.encryptedTokens) return null;
  return decryptJson<OAuthTokens>(c.encryptedTokens);
}

export async function setConnectionStatus(provider: ConnectionProvider, status: ConnectionStatus, lastError: string | null = null) {
  await upsertConnection(provider, { status, lastError, lastCheckedAt: new Date() });
}
