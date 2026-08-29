"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ReporterNavigationProps = Readonly<{ className?: string; onNavigate?: () => void; reporterAccess: boolean }>;
const baseItems = [{ href: "/dashboard", label: "Dashboard" }, { href: "/application", label: "Application" }] as const;
const reporterItems = [{ href: "/stories", label: "Stories" }, { href: "/live", label: "Live" }, { href: "/membership", label: "Membership" }] as const;

export function ReporterNavigation({ className, onNavigate, reporterAccess }: ReporterNavigationProps) {
  const pathname = usePathname();
  const items = reporterAccess ? [...baseItems, ...reporterItems] : baseItems;
  return (
    <nav aria-label="Reporter navigation" className={className}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <Link aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} href={item.href} key={item.href} onClick={onNavigate}>{item.label}</Link>;
      })}
    </nav>
  );
}
