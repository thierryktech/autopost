"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import type { SessionUser } from "@/server/auth";

export function UserMenu({ user }: { user: SessionUser }) {
  const initials = (user.name ?? user.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return (
    <M.Root>
      <M.Trigger className="inline-flex size-11 items-center justify-center rounded-full" aria-label="Account menu">
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" className="size-9 rounded-full object-cover ring-2 ring-white" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-peach-300 text-xs font-bold text-teal-900 ring-2 ring-white">{initials}</span>
        )}
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-raised)]">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-ink-900">{user.name ?? "Signed in"}</p>
            <p className="text-xs text-ink-500">{user.demo ? "Local demo (sign-in disabled)" : user.email}</p>
          </div>
          <M.Separator className="my-1 h-px bg-line" />
          <M.Item asChild>
            <Link href="/settings" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm outline-none data-[highlighted]:bg-teal-50">
              <Settings className="size-4" aria-hidden /> Settings
            </Link>
          </M.Item>
          {!user.demo && (
            <M.Item asChild>
              <a href="/api/auth/logout" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-danger-700 outline-none data-[highlighted]:bg-danger-100">
                <LogOut className="size-4" aria-hidden /> Sign out
              </a>
            </M.Item>
          )}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
