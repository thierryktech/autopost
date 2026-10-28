"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Package, Plus, Pencil, Link2, Tag, ShieldCheck, Trash2, Archive, ArchiveRestore, Upload } from "lucide-react";
import type { NativeTagInfo, ProductType } from "@/server/db/schema";
import { PageHeader, EmptyState, Notice } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveProductAction, archiveProductAction } from "@/app/actions";
import { cn } from "@/lib/cn";

type P = {
  id: string;
  name: string;
  nameTh: string | null;
  type: ProductType;
  imageUrl: string | null;
  verifiedFacts: string[];
  destinationUrl: string | null;
  nativeTag: NativeTagInfo;
  archived: boolean;
  isDemo: boolean;
};

const TAG: Record<NativeTagInfo["eligibility"], { label: string; tone: "warning" | "success" | "danger" | "neutral"; help: string }> = {
  unknown: { label: "Not verified", tone: "warning", help: "We haven’t confirmed this product can be natively tagged. Assume manual tagging." },
  eligible: { label: "Eligible (you confirmed)", tone: "success", help: "You confirmed this item is in your Meta catalog/Shop. Tags are still added manually after publishing." },
  not_eligible: { label: "Not eligible", tone: "danger", help: "This product can’t be natively tagged on your Page." },
  not_supported: { label: "Not supported", tone: "neutral", help: "Marketplace affiliate items (e.g. Shopee) can’t be natively tagged via the Reels API." },
};

export function ProductsView({ products }: { products: P[] }) {
  const [editing, setEditing] = useState<P | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = products.filter((p) => showArchived || !p.archived);
  return (
    <div>
      <PageHeader
        title="Products"
        description="Only verified facts saved here may be used in captions. A saved link and a native Facebook product tag are separate things."
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add product</Button>
          </>
        }
      />
      <Notice tone="info" className="mb-5" icon={<Tag />} title="About product tags">
        The Facebook Reels publishing API doesn’t attach product tags, and marketplace affiliate items (such as Shopee) generally can’t be natively tagged. Balena adds your saved link to the caption and gives you a manual tagging checklist after publishing.
      </Notice>
      {list.length ? (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((p) => (
            <li key={p.id} className={cn("rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]", p.archived && "opacity-60")}>
              <div className="flex gap-4">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-peach-100 text-peach-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-7" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-ink-900">{p.name}</h2>
                      {p.nameTh && <p lang="th" className="font-thai truncate text-sm text-ink-600">{p.nameTh}</p>}
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil className="size-4" /></Button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={p.type === "own" ? "teal" : "peach"}>{p.type === "own" ? "Balena product" : "Affiliate product"}</Badge>
                    {p.isDemo && <Badge tone="demo">Demo</Badge>}
                    {p.archived && <Badge>Archived</Badge>}
                  </div>
                </div>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><ShieldCheck className="size-3.5" aria-hidden />Verified facts ({p.verifiedFacts.length})</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {p.verifiedFacts.length ? p.verifiedFacts.map((f) => <span key={f} lang="th" className="font-thai rounded-full bg-cream px-2.5 py-0.5 text-xs ring-1 ring-line">{f}</span>) : <span className="text-xs text-ink-400">None — captions won’t describe this product’s properties.</span>}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Link2 className="size-3.5" aria-hidden />Saved link (added to caption)</dt>
                  <dd className="mt-0.5 truncate text-xs">{p.destinationUrl ? <a href={p.destinationUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline-offset-2 hover:underline">{p.destinationUrl}</a> : <span className="text-ink-400">No link</span>}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Tag className="size-3.5" aria-hidden />Native Facebook product tag</dt>
                  <dd className="mt-1"><Badge tone={TAG[p.nativeTag.eligibility].tone}>{TAG[p.nativeTag.eligibility].label}</Badge><p className="mt-1 text-xs text-ink-500">{p.nativeTag.note ?? TAG[p.nativeTag.eligibility].help}</p></dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Package />} title="No products yet" description="Add your Balena products and any affiliate items you feature." action={<Button variant="primary" onClick={() => setEditing("new")}>Add product</Button>} />
      )}
      <ProductDialog product={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const EMPTY: Omit<P, "id" | "archived" | "isDemo"> = {
  name: "",
  nameTh: null,
  type: "own",
  imageUrl: null,
  verifiedFacts: [],
  destinationUrl: null,
  nativeTag: { eligibility: "unknown", catalogProductId: null, checkedAt: null, note: null },
};

function ProductDialog({ product, onClose }: { product: P | "new" | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const initial = product === "new" || !product ? EMPTY : product;
  const [form, setForm] = useState(initial);
  const [factDraft, setFactDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = product === "new" ? "new" : product?.id ?? null;
  if (key !== lastKey) {
    setLastKey(key);
    setForm(initial);
    setFactDraft("");
    setError(null);
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pid = product && product !== "new" ? product.id : null;

  const onImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 250_000) return setError("Image must be under 250 KB.");
    const reader = new FileReader();
    reader.onload = () => set("imageUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <Dialog
      open={!!product}
      onOpenChange={(o) => !o && onClose()}
      title={pid ? "Edit product" : "Add product"}
      size="lg"
      footer={
        <>
          {pid && product !== "new" && (
            <Button variant="ghost" className="mr-auto" icon={product!.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => start(async () => { const r = await archiveProductAction(pid, !(product as P).archived); if (r.ok) { onClose(); router.refresh(); } })}>
              {(product as P).archived ? "Restore" : "Archive"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              start(async () => {
                const facts = factDraft.trim() ? [...form.verifiedFacts, factDraft.trim()] : form.verifiedFacts;
                const r = await saveProductAction(pid, { ...form, verifiedFacts: facts, destinationUrl: form.destinationUrl?.trim() || null, nameTh: form.nameTh?.trim() || null });
                if (r.ok) {
                  toast({ tone: "success", message: "Product saved" });
                  onClose();
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            Save product
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Product name">{(id) => <Input id={id} value={form.name} onChange={(e) => set("name", e.target.value)} required />}</Field>
        <Field label="Thai name (optional)">{(id) => <Input id={id} lang="th" className="font-thai" value={form.nameTh ?? ""} onChange={(e) => set("nameTh", e.target.value)} />}</Field>
        <Field label="Product type">
          {(id) => (
            <Select id={id} value={form.type} onChange={(e) => set("type", e.target.value as ProductType)}>
              <option value="own">Balena own product</option>
              <option value="affiliate">Affiliate product</option>
            </Select>
          )}
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-700">Image</p>
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl bg-peach-100 text-peach-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {form.imageUrl ? <img src={form.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-6" aria-hidden />}
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-within:shadow-[var(--shadow-focus)]">
              <Upload className="size-4" aria-hidden /> Upload
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} />
            </label>
            {form.imageUrl && <Button variant="ghost" onClick={() => set("imageUrl", null)}>Remove</Button>}
          </div>
        </div>
        <div className="md:col-span-2">
          <p className="mb-1.5 text-sm font-semibold text-ink-700">Verified facts</p>
          <p className="mb-2 text-xs text-ink-500">Write facts exactly as they may appear in copy. Claude and the copy checker only allow these — no invented prices, tasting notes or health claims.</p>
          <ul className="mb-2 space-y-1.5">
            {form.verifiedFacts.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`fact-${i}`}>Fact {i + 1}</label>
                <Input id={`fact-${i}`} lang="th" className="font-thai" value={f} onChange={(e) => set("verifiedFacts", form.verifiedFacts.map((x, j) => (j === i ? e.target.value : x)))} />
                <Button variant="ghost" size="icon" aria-label={`Remove fact ${i + 1}`} onClick={() => set("verifiedFacts", form.verifiedFacts.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="new-fact">New fact</label>
            <Input id="new-fact" lang="th" className="font-thai" placeholder="เช่น ถุงขนาด 250 กรัม" value={factDraft} onChange={(e) => setFactDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && factDraft.trim()) { e.preventDefault(); set("verifiedFacts", [...form.verifiedFacts, factDraft.trim()]); setFactDraft(""); } }} />
            <Button disabled={!factDraft.trim()} onClick={() => { set("verifiedFacts", [...form.verifiedFacts, factDraft.trim()]); setFactDraft(""); }}>Add</Button>
          </div>
        </div>
        <Field label="Destination link" hint="Saved link only — e.g. your shop page or affiliate URL. It’s appended to the caption; it is not a native product tag." className="md:col-span-2">
          {(id, d) => <Input id={id} aria-describedby={d} type="url" inputMode="url" placeholder="https://" value={form.destinationUrl ?? ""} onChange={(e) => set("destinationUrl", e.target.value)} />}
        </Field>
        <fieldset className="rounded-2xl border border-line p-4 md:col-span-2">
          <legend className="px-1 text-sm font-semibold text-ink-700">Native Facebook product tag</legend>
          <p className="mb-3 text-xs text-ink-500">Separate from the link above. Only set “eligible” after you confirm the item exists in your Meta catalog and your Page can tag it.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tagging eligibility">
              {(id) => (
                <Select id={id} value={form.nativeTag.eligibility} onChange={(e) => set("nativeTag", { ...form.nativeTag, eligibility: e.target.value as NativeTagInfo["eligibility"], checkedAt: new Date().toISOString() })}>
                  <option value="unknown">Not verified</option>
                  <option value="eligible">Eligible (I confirmed in Meta)</option>
                  <option value="not_eligible">Not eligible</option>
                  <option value="not_supported">Not supported (e.g. Shopee affiliate)</option>
                </Select>
              )}
            </Field>
            <Field label="Meta catalog product ID (optional)">{(id) => <Input id={id} value={form.nativeTag.catalogProductId ?? ""} onChange={(e) => set("nativeTag", { ...form.nativeTag, catalogProductId: e.target.value || null })} />}</Field>
            <Field label="Note" className="md:col-span-2">{(id) => <Textarea id={id} rows={2} value={form.nativeTag.note ?? ""} onChange={(e) => set("nativeTag", { ...form.nativeTag, note: e.target.value || null })} />}</Field>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm font-medium text-danger-700 md:col-span-2">{error}</p>}
      </div>
    </Dialog>
  );
}
