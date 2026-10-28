import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "peach" | "ghost" | "danger" | "subtle";
type Size = "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold text-sm transition-[background,box-shadow,transform,color] select-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-gradient-primary text-white shadow-[0_6px_16px_rgb(47_82_87/0.25)] hover:brightness-110",
  secondary: "bg-white text-teal-800 border border-line-strong hover:bg-teal-50",
  peach: "bg-peach-100 text-peach-700 border border-peach-200 hover:bg-peach-200",
  ghost: "text-teal-800 hover:bg-teal-50",
  subtle: "bg-teal-50 text-teal-800 hover:bg-teal-100",
  danger: "bg-white text-danger-700 border border-danger-100 hover:bg-danger-100",
};
// Every size keeps a minimum 44×44 px touch target.
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4",
  lg: "min-h-12 px-5 text-[15px]",
  icon: "size-11 shrink-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children?: ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
