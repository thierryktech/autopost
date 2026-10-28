import { Clapperboard, Plus } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/connect";
import { footage } from "@/server/db/schema";
import { listProjects } from "@/server/services/projects";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { ReelCard } from "@/components/reel-card";
import { NewReelForm } from "./new-reel-form";

export const metadata = { title: "Create Reel" };

export default async function CreatePage() {
  const db = await getDb();
  const [drafts, library] = await Promise.all([
    listProjects({ statuses: ["draft", "changes_requested", "render_failed", "rendering"] }),
    db.select().from(footage).where(eq(footage.kind, "source")),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Footage → Brief → Thai copy → Review" title="Create Reel" description="Pick clips from your Drive library to start a new Reel, or continue a draft." />
      <NewReelForm library={library.filter((f) => f.availability === "available").map((f) => ({ id: f.id, driveFileId: f.driveFileId, name: f.name, durationMs: f.durationMs, width: f.width, height: f.height, available: true }))} />
      <section aria-labelledby="drafts" className="mt-8">
        <h2 id="drafts" className="mb-3 text-[15px] font-semibold text-ink-900">Drafts in progress</h2>
        {drafts.length ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {drafts.map((d) => (
              <li key={d.id}><ReelCard reel={d} href={`/create/${d.id}`} /></li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Clapperboard />} title="No drafts in progress" description="Start a new Reel above." action={<Plus className="hidden" />} />
        )}
      </section>
    </div>
  );
}
