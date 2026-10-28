import { cn } from "@/lib/cn";

export function BeanMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <ellipse cx="16" cy="16" rx="9" ry="12.5" transform="rotate(28 16 16)" stroke="currentColor" strokeWidth="2" />
      <path d="M11.5 6.5c4 4.5 2.5 9 4.5 11.5s6 4 5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-white", className)}>
      <BeanMark className="size-7 text-peach-300" />
      {!compact && (
        <>
          <span className="mt-1 text-[17px] font-bold tracking-[0.32em] pl-[0.32em]">BALENA</span>
          <span className="text-[9px] font-semibold tracking-[0.42em] pl-[0.42em] text-teal-300">REEL STUDIO</span>
        </>
      )}
    </div>
  );
}
