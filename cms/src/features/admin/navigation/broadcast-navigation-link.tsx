"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function BroadcastNavigationLink() {
  const pathname = usePathname();
  const active =
    pathname === "/admin/broadcast" ||
    pathname.startsWith("/admin/broadcast/");

  return (
    <Link
      href="/admin/broadcast"
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-muted text-foreground",
      )}
    >
      <Radio aria-hidden="true" className="size-3.5" />Broadcast
    </Link>
  );
}
