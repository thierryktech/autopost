"use client";
import { Minus, Plus } from "lucide-react";
import { useId } from "react";

/** Seconds stepper with large touch targets (no drag needed). */
export function TimeStepper({ label, valueMs, onChange, min, max, step = 100 }: { label: string; valueMs: number; onChange: (ms: number) => void; min: number; max: number; step?: number }) {
  const id = useId();
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / 100) * 100));
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-600">{label}</label>
      <div className="flex items-center rounded-[var(--radius-control)] border border-line-strong bg-white">
        <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-l-[var(--radius-control)] text-ink-600 hover:bg-teal-50 disabled:opacity-40" onClick={() => onChange(clamp(valueMs - step * 5))} disabled={valueMs <= min} aria-label={`${label}: back 0.5 seconds`}>
          <Minus className="size-4" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={0.1}
          min={min / 1000}
          max={max / 1000}
          value={(valueMs / 1000).toFixed(1)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(clamp(v * 1000));
          }}
          className="h-11 w-full min-w-0 border-x border-line bg-transparent text-center text-sm tabular-nums focus:outline-none"
        />
        <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-r-[var(--radius-control)] text-ink-600 hover:bg-teal-50 disabled:opacity-40" onClick={() => onChange(clamp(valueMs + step * 5))} disabled={valueMs >= max} aria-label={`${label}: forward 0.5 seconds`}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
