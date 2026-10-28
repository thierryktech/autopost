import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { getShellData } from "@/server/services/overview";
import { Sidebar, MobileNav } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { Logo } from "@/components/shell/logo";
import { ToastProvider } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const shell = await getShellData();
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:font-semibold">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar counts={shell.counts} />
        <div className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3 safe-pr">
          <div className="flex items-center justify-between px-2 py-1 safe-pt md:hidden">
            <MobileNav counts={shell.counts} />
            <Logo compact />
            <span className="size-11" aria-hidden />
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded-t-[24px] bg-[#f6f8f7] md:rounded-[var(--radius-panel)]">
            <TopBar user={user} shell={shell} />
            <main id="main" className="flex-1 px-4 pb-10 pt-2 safe-pb md:px-6 lg:px-8" tabIndex={-1}>
              {children}
            </main>
          </div>
        </div>
      </div>
      <AutoRefresh busy={shell.busy} />
    </ToastProvider>
  );
}
