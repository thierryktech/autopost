/*
 * Authenticated media proxy. The browser never receives Drive tokens: thumbnails and video bytes are
 * streamed through the server (HTTP Range supported for scrubbing on iPad/Safari).
 */
import { getSessionUser } from "@/server/auth";
import { driveAdapter } from "@/server/adapters";
import { AdapterError } from "@/server/adapters/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ kind: string; fileId: string }> }) {
  if (!(await getSessionUser())) return new Response("Unauthorized", { status: 401 });
  const { kind, fileId } = await ctx.params;
  if (!/^[\w-]{1,200}$/.test(fileId)) return new Response("Bad file id", { status: 400 });
  const drive = driveAdapter();
  try {
    if (kind === "thumb") return await drive.fetchThumbnail(fileId);
    if (kind === "stream") return await drive.fetchContent(fileId, req.headers.get("range"));
    return new Response("Not found", { status: 404 });
  } catch (e) {
    // Name check (not instanceof): the class can be loaded in more than one server bundle.
    if (e instanceof AdapterError || (e as Error)?.name === "AdapterError") {
      const err = e as AdapterError;
      const status = err.code === "not_found" ? 404 : err.code === "permission_denied" ? 403 : err.code === "auth_expired" || err.code === "not_configured" ? 409 : 502;
      return new Response(err.message, { status });
    }
    throw e;
  }
}
