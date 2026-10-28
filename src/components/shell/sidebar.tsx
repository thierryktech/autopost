"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as D from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { NAV } from "./nav-items";
import { Logo } from "./logo";
import { cn } from "@/lib/cn";

type Counts = { review: number; failures: number };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function CountDot({ n, tone }: { n: number; tone: "peach" | "danger" }) {
  if (!n) return null;
  return (
    <span className={cn("ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5", tone === "peach" ? "bg-peach-300 text-teal-900" : "bg-[#f2b5ab] text-teal-950")}>
      {n}
      <span className="sr-only">{tone === "peach" ? " waiting for review" : " unresolved problems"}</span>
    </span>
  );
}

/** Full sidebar ≥1024px, compact rail 768–1023px (iPad portrait), drawer below. */
export function Sidebar({ counts }: { counts: Counts }) {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[88px] shrink-0 flex-col items-center gap-1 overflow-y-auto py-5 safe-pl md:flex lg:hidden">
        <Link href="/" className="mb-4 rounded-xl p-1" aria-label="Balena Reel Studio home">
          <Logo compact />
        </Link>
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const n = item.countKey ? counts[item.countKey] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-[72px] flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[10.5px] font-semibold text-teal-200 transition-colors hover:bg-white/5",
                active && "bg-white/12 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]",
              )}
            >
              <item.icon className="size-[22px]" strokeWidth={1.6} aria-hidden />
              {item.short}
              {n > 0 && <span className="absolute right-2 top-1.5 size-2.5 rounded-full bg-peach-300" aria-label={`${n} pending`} />}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col overflow-y-auto px-4 py-7 lg:flex">
        <Link href="/" className="mb-8 self-center rounded-xl p-1" aria-label="Balena Reel Studio home">
          <Logo />
        </Link>
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-teal-100/85 transition-colors hover:bg-white/6 hover:text-white",
                    active && "bg-white/12 font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]",
                  )}
                >
                  <item.icon className="size-[19px]" strokeWidth={1.6} aria-hidden />
                  {item.label}
                  {item.countKey && <CountDot n={counts[item.countKey]} tone={item.countKey === "review" ? "peach" : "danger"} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function MobileNav({ counts }: { counts: Counts }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="inline-flex size-11 items-center justify-center rounded-xl text-white hover:bg-white/10 md:hidden" aria-label="Open navigation">
        <Menu className="size-6" strokeWidth={1.75} />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-teal-950/50" />
        <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-teal-900 px-4 py-5 safe-pt safe-pb safe-pl focus:outline-none">
          <D.Title className="sr-only">Navigation</D.Title>
          <D.Description className="sr-only">Main sections of Balena Reel Studio</D.Description>
          <div className="mb-6 flex items-center justify-between">
            <Logo className="items-start" />
            <D.Close className="inline-flex size-11 items-center justify-center rounded-xl text-white hover:bg-white/10" aria-label="Close navigation">
              <X className="size-6" />
            </D.Close>
          </div>
          <ul className="space-y-1 overflow-y-auto">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-teal-100", active && "bg-white/12 text-white")}
                  >
                    <item.icon className="size-5" strokeWidth={1.6} aria-hidden />
                    {item.label}
                    {item.countKey && <CountDot n={counts[item.countKey]} tone={item.countKey === "review" ? "peach" : "danger"} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
