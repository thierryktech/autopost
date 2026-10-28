import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-cream/60 px-6 py-10 text-center", className)}>
      {icon && <div className="flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 [&>svg]:size-6">{icon}</div>}
      <div>
        <p className="font-semibold text-ink-900">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("relative overflow-hidden rounded-xl bg-teal-50", className)} aria-hidden />;
}

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-teal-50", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
      <div className="h-full rounded-full bg-gradient-progress transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-600">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action, className, icon }: { tone?: "info" | "warning" | "danger" | "success" | "demo"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode }) {
  const tones = {
    info: "bg-info-100/70 border-info-100 text-info-700",
    warning: "bg-warning-100 border-warning-100 text-warning-700",
    danger: "bg-danger-100 border-danger-100 text-danger-700",
    success: "bg-success-100 border-success-100 text-success-700",
    demo: "bg-peach-50 border-peach-200 border-dashed text-peach-700",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm", tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:size-5" aria-hidden>{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-ink-700")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Stat({ icon, value, label, tone = "teal" }: { icon: ReactNode; value: ReactNode; label: string; tone?: "teal" | "peach" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-[var(--shadow-card)]">
      <span className={cn("flex size-11 items-center justify-center rounded-xl [&>svg]:size-5", tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-peach-100 text-peach-700")} aria-hidden>
        {icon}
      </span>
      <div>
        <div className="text-2xl font-semibold leading-none tabular-nums text-ink-900">{value}</div>
        <div className="mt-1 text-xs font-medium text-ink-500">{label}</div>
      </div>
    </div>
  );
}
