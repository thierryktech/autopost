import Link from "next/link";
import { Bell, Search } from "lucide-react";
import type { SessionUser } from "@/server/auth";
import type { getShellData } from "@/server/services/overview";
import { UserMenu } from "./user-menu";
import { DemoBadge } from "../ui/badge";

export function TopBar({ user, shell }: { user: SessionUser; shell: Awaited<ReturnType<typeof getShellData>> }) {
  const problems = shell.connections.filter((c) => ["expired", "permission_denied", "error"].includes(c.status));
  return (
    <header className="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 md:px-6 lg:px-8">
      <form action="/library" role="search" className="relative order-2 w-full sm:order-1 sm:w-auto sm:flex-1 sm:max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" aria-hidden />
        <label htmlFor="global-search" className="sr-only">Search clips</label>
        <input
          id="global-search"
          name="q"
          type="search"
          placeholder="Search clips in Drive…"
          className="min-h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm placeholder:text-ink-400 focus:border-teal-500 focus:outline-none focus:shadow-[var(--shadow-focus)]"
        />
      </form>
      <div className="order-1 ml-auto flex items-center gap-1.5 sm:order-2">
        {shell.anyDemo && (
          <Link href="/settings#integrations" className="hidden rounded-full sm:inline-flex" title="Some integrations run in demo mode">
            <DemoBadge label="Demo mode" />
          </Link>
        )}
        {problems.length > 0 && (
          <Link href="/settings#integrations" className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-danger-700 hover:bg-danger-100">
            {problems.length === 1 ? "1 connection needs attention" : `${problems.length} connections need attention`}
          </Link>
        )}
        <Link href="/activity" className="relative inline-flex size-11 items-center justify-center rounded-full text-ink-600 hover:bg-white" aria-label={`Activity${shell.counts.failures ? `, ${shell.counts.failures} unresolved problems` : ""}`}>
          <Bell className="size-5" strokeWidth={1.75} />
          {shell.counts.failures > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-danger-700 ring-2 ring-[#f6f8f7]" aria-hidden />}
        </Link>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
