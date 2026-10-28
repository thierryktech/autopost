import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "teal" | "peach" | "success" | "warning" | "danger" | "info" | "demo";

const tones: Record<Tone, string> = {
  neutral: "bg-teal-50 text-ink-700 border-line",
  teal: "bg-teal-100 text-teal-800 border-teal-200",
  peach: "bg-peach-100 text-peach-700 border-peach-200",
  success: "bg-success-100 text-success-700 border-success-100",
  warning: "bg-warning-100 text-warning-700 border-warning-100",
  danger: "bg-danger-100 text-danger-700 border-danger-100",
  info: "bg-info-100 text-info-700 border-info-100",
  demo: "bg-white text-peach-700 border-peach-300 border-dashed",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap", tones[tone], className)}>
      {icon && <span aria-hidden className="[&>svg]:size-3.5">{icon}</span>}
      {children}
    </span>
  );
}

export function DemoBadge({ label = "Demo", className }: { label?: string; className?: string }) {
  return (
    <Badge tone="demo" className={className}>
      {label}
    </Badge>
  );
}
