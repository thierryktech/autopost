"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === "error" ? 9000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 safe-pb md:items-end" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-sm shadow-[var(--shadow-raised)]",
              t.tone === "error" ? "border-danger-100" : "border-line",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-700" aria-hidden />
            ) : t.tone === "error" ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-700" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-5 shrink-0 text-info-700" aria-hidden />
            )}
            <p className="flex-1 text-ink-800">{t.message}</p>
            <button className="-m-2 inline-flex size-11 items-center justify-center rounded-xl text-ink-400 hover:bg-teal-50" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
