"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2, Upload, Save } from "lucide-react";
import type { SubtitleStyle } from "@/server/db/schema";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveBrandKitAction } from "@/app/actions";
import { BeanMark } from "@/components/shell/logo";

type Kit = {
  brandName: string;
  logoUrl: string | null;
  colors: { name: string; hex: string }[];
  headingFont: string;
  bodyFont: string;
  subtitleStyle: SubtitleStyle;
  toneOfVoice: string;
  defaultCtas: string[];
  prohibitedClaims: string[];
};

function ListEditor({ label, hint, items, onChange, placeholder, thai }: { label: string; hint?: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; thai?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <div>
      <p className="text-sm font-semibold text-ink-700">{label}</p>
      {hint && <p className="mb-2 text-xs text-ink-500">{hint}</p>}
      <ul className="mb-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${label}-${i}`}>{label} {i + 1}</label>
            <Input id={`${label}-${i}`} lang={thai ? "th" : undefined} className={thai ? "font-thai" : undefined} value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button variant="ghost" size="icon" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`${label}-new`}>Add {label}</label>
        <Input id={`${label}-new`} lang={thai ? "th" : undefined} className={thai ? "font-thai" : undefined} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button icon={<Plus className="size-4" />} disabled={!draft.trim()} onClick={add}>Add</Button>
      </div>
    </div>
  );
}

export function BrandForm({ initial, updatedAt }: { initial: Kit; updatedAt: string }) {
  const router = useRouter();
  const toast = useToast();
  const [kit, setKit] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(kit) !== JSON.stringify(initial);
  const set = <K extends keyof Kit>(k: K, v: Kit[K]) => setKit((x) => ({ ...x, [k]: v }));
  const ss = kit.subtitleStyle;
  const setSS = (patch: Partial<SubtitleStyle>) => set("subtitleStyle", { ...ss, ...patch });

  const save = () =>
    start(async () => {
      const r = await saveBrandKitAction(kit as Parameters<typeof saveBrandKitAction>[0]);
      if (r.ok) {
        toast({ tone: "success", message: "Brand kit saved. New renders will use it." });
        router.refresh();
      } else toast({ tone: "error", message: r.error });
    });

  return (
    <div className="pb-24">
      <PageHeader
        title="Brand Kit"
        description="Used for subtitles, logo overlays and every Thai draft. Changes apply to new renders."
        actions={<Button variant="primary" loading={pending} disabled={!dirty} icon={<Save className="size-4" />} onClick={save}>{dirty ? "Save changes" : "Saved"}</Button>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Identity" />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field label="Brand name">{(id) => <Input id={id} value={kit.brandName} onChange={(e) => set("brandName", e.target.value)} />}</Field>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-ink-700">Logo (overlay, PNG with transparency)</p>
                <div className="flex items-center gap-3">
                  <div className="flex size-14 items-center justify-center rounded-xl bg-teal-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {kit.logoUrl ? <img src={kit.logoUrl} alt="Current logo" className="max-h-12 max-w-12 object-contain" /> : <BeanMark className="size-7 text-peach-300" />}
                  </div>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-within:shadow-[var(--shadow-focus)]">
                    <Upload className="size-4" aria-hidden /> Upload
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 280_000) return toast({ tone: "error", message: "Logo must be under 280 KB." });
                        const r = new FileReader();
                        r.onload = () => set("logoUrl", String(r.result));
                        r.readAsDataURL(f);
                      }}
                    />
                  </label>
                  {kit.logoUrl && <Button variant="ghost" onClick={() => set("logoUrl", null)}>Remove</Button>}
                </div>
                <p className="mt-1 text-xs text-ink-500">Shown in the top-right corner of renders. Leave empty for no logo.</p>
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-semibold text-ink-700">Colours</p>
                <ul className="flex flex-wrap gap-3">
                  {kit.colors.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-2xl border border-line p-2 pr-1">
                      <label className="sr-only" htmlFor={`col-${i}`}>Colour {c.name}</label>
                      <input id={`col-${i}`} type="color" value={c.hex} onChange={(e) => set("colors", kit.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)))} className="size-11 cursor-pointer rounded-xl border-0 bg-transparent" />
                      <div>
                        <label className="sr-only" htmlFor={`coln-${i}`}>Colour name</label>
                        <input id={`coln-${i}`} value={c.name} onChange={(e) => set("colors", kit.colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-28 rounded-lg px-1 text-sm font-medium focus:outline-none focus:shadow-[var(--shadow-focus)]" />
                        <p className="px-1 font-mono text-xs text-ink-500">{c.hex}</p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Remove colour ${c.name}`} onClick={() => set("colors", kit.colors.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                    </li>
                  ))}
                  {kit.colors.length < 10 && <li><Button icon={<Plus className="size-4" />} onClick={() => set("colors", [...kit.colors, { name: "New colour", hex: "#2F5257" }])}>Add colour</Button></li>}
                </ul>
              </div>
              <Field label="Heading font">{(id) => <Select id={id} value={kit.headingFont} onChange={(e) => set("headingFont", e.target.value)}><option>Prompt</option><option>Noto Sans Thai</option></Select>}</Field>
              <Field label="Body font">{(id) => <Select id={id} value={kit.bodyFont} onChange={(e) => set("bodyFont", e.target.value)}><option>Noto Sans Thai</option><option>Prompt</option></Select>}</Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Subtitle style" description="Burned into renders with full Thai shaping." />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field label="Font">{(id) => <Select id={id} value={ss.fontFamily} onChange={(e) => setSS({ fontFamily: e.target.value })}><option value="Prompt">Prompt (bold)</option><option value="Prompt Medium">Prompt Medium</option><option value="Noto Sans Thai">Noto Sans Thai</option></Select>}</Field>
              <Field label={`Size ${ss.fontSizePx}px (on 1080×1920)`}>{(id) => <input id={id} type="range" min={40} max={110} step={2} value={ss.fontSizePx} onChange={(e) => setSS({ fontSizePx: Number(e.target.value) })} className="h-11 w-full accent-teal-700" />}</Field>
              <Field label="Text colour">{(id) => <input id={id} type="color" value={ss.textColor} onChange={(e) => setSS({ textColor: e.target.value.toUpperCase() })} className="h-11 w-24 cursor-pointer rounded-xl" />}</Field>
              <Field label="Outline colour">{(id) => <input id={id} type="color" value={ss.outlineColor} onChange={(e) => setSS({ outlineColor: e.target.value.toUpperCase() })} className="h-11 w-24 cursor-pointer rounded-xl" />}</Field>
              <Field label="Background box">
                {(id) => (
                  <Select id={id} value={ss.boxColor ? "box" : "outline"} onChange={(e) => setSS({ boxColor: e.target.value === "box" ? ss.outlineColor : null })}>
                    <option value="outline">Outline only</option>
                    <option value="box">Solid box</option>
                  </Select>
                )}
              </Field>
              <Field label="Position">{(id) => <Select id={id} value={ss.position} onChange={(e) => setSS({ position: e.target.value as SubtitleStyle["position"] })}><option value="bottom">Lower third</option><option value="middle">Centre</option></Select>}</Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Thai voice & guardrails" description="Guides every caption and subtitle draft." />
            <CardBody className="space-y-5">
              <Field label="Tone of voice" hint="Warm, natural and clear. Describe how BALENA talks.">{(id, d) => <Textarea id={id} aria-describedby={d} lang="th" rows={4} className="font-thai" value={kit.toneOfVoice} onChange={(e) => set("toneOfVoice", e.target.value)} />}</Field>
              <ListEditor label="Default calls to action" items={kit.defaultCtas} onChange={(v) => set("defaultCtas", v)} placeholder="เช่น สั่งได้ที่ลิงก์ในโพสต์" thai />
              <ListEditor label="Prohibited claims" hint="Never used in drafts and flagged in review. Add health, price or superlative claims you must avoid." items={kit.prohibitedClaims} onChange={(v) => set("prohibitedClaims", v)} placeholder="เช่น ลดน้ำหนัก" thai />
            </CardBody>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start" aria-label="Subtitle preview">
          <Card>
            <CardHeader title="Preview" description="Approximate — the render uses the same fonts." />
            <CardBody>
              <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-[22px] bg-gradient-to-b from-[#3d2a1e] via-[#8a5a3b] to-[#e8c39e]" style={{ containerType: "inline-size" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {kit.logoUrl && <img src={kit.logoUrl} alt="" className="absolute right-[5%] top-[4%] w-[17%]" />}
                <div className={ss.position === "middle" ? "absolute inset-x-3 top-1/2 -translate-y-1/2 text-center" : "absolute inset-x-3 bottom-[16%] text-center"}>
                  <span
                    lang="th"
                    className="inline-block px-2 py-0.5 leading-snug"
                    style={{
                      fontFamily: ss.fontFamily.startsWith("Prompt") ? "var(--font-prompt), var(--font-thai)" : "var(--font-thai)",
                      fontWeight: ss.fontFamily === "Prompt" ? 700 : 500,
                      fontSize: `${(ss.fontSizePx / 1080) * 100}cqw`,
                      color: ss.textColor,
                      background: ss.boxColor ? `${ss.boxColor}cc` : undefined,
                      textShadow: ss.boxColor ? undefined : `0 0 3px ${ss.outlineColor}, 0 0 3px ${ss.outlineColor}`,
                      borderRadius: 6,
                    }}
                  >
                    กาแฟเย็นแก้วโปรด ☕
                  </span>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-ink-500" suppressHydrationWarning>Last saved {new Date(updatedAt).toLocaleString()}</p>
            </CardBody>
          </Card>
        </aside>
      </div>
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-pb md:left-[100px] lg:left-[244px]">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[var(--shadow-raised)]">
            <p className="mr-auto text-sm text-ink-700">You have unsaved brand changes.</p>
            <Button variant="ghost" onClick={() => setKit(initial)}>Discard</Button>
            <Button variant="primary" loading={pending} onClick={save}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}
