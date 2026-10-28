import { getDb, databaseKind } from "@/server/db/connect";

export const dynamic = "force-dynamic";

/** Liveness/readiness for hosting platforms. Reveals no configuration. */
export async function GET() {
  try {
    await getDb();
    return Response.json({ ok: true, db: databaseKind() });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
