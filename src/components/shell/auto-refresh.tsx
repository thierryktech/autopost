"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps server-rendered data in sync across devices: refreshes when the tab regains focus or the
 * network returns, and polls while visible (faster while jobs are running).
 */
export function AutoRefresh({ busy }: { busy: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !document.querySelector("[data-editing-dirty='true']")) router.refresh();
    };
    const interval = setInterval(refresh, busy ? 4000 : 20000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [busy, router]);
  return null;
}
