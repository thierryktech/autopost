import { LayoutDashboard, FolderOpen, Clapperboard, ClipboardCheck, CalendarDays, Package, Palette, Activity, Settings } from "lucide-react";

export const NAV = [
  { href: "/", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/library", label: "Drive Library", short: "Library", icon: FolderOpen },
  { href: "/create", label: "Create Reel", short: "Create", icon: Clapperboard },
  { href: "/review", label: "Review Queue", short: "Review", icon: ClipboardCheck, countKey: "review" as const },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: CalendarDays },
  { href: "/products", label: "Products", short: "Products", icon: Package },
  { href: "/brand", label: "Brand Kit", short: "Brand", icon: Palette },
  { href: "/activity", label: "Activity", short: "Activity", icon: Activity, countKey: "failures" as const },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];
