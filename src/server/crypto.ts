import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "./env";

/*
 * AES-256-GCM envelope for OAuth tokens stored in the database. The key comes from
 * TOKEN_ENCRYPTION_KEY (32 random bytes, base64). In demo mode with no key, a key derived from
 * AUTH_SECRET (or a fixed dev string) is used and a warning is logged.
 */
function key(): Buffer {
  const raw = env.tokenEncryptionKey;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return buf;
  }
  if (env.isProduction) throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
  return createHash("sha256").update(env.authSecret || "balena-dev-only-key").digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptJson<T>(payload: string): T {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown token envelope");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}
