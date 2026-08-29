import type { HTMLAttributes } from "react";

export type ReporterBadgeState = "draft" | "pending_review" | "approved" | "scheduled" | "published" | "rejected";
const stateStyles: Record<ReporterBadgeState, string> = {
  draft: "border-border bg-secondary text-secondary-foreground",
  pending_review: "border-border bg-muted text-foreground",
  approved: "border-verified/30 bg-verified/10 text-verified",
  scheduled: "border-foreground/20 bg-foreground/5 text-foreground",
  published: "border-verified/30 bg-verified text-verified-foreground",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};
type BadgeProps = HTMLAttributes<HTMLSpanElement> & Readonly<{ state?: ReporterBadgeState }>;
export function Badge({ className = "", state = "draft", ...props }: BadgeProps) { return <span className={`inline-flex items-center rounded-sm border px-2 py-1 text-xs font-semibold leading-none tracking-wide ${stateStyles[state]} ${className}`} {...props} />; }
