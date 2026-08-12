import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { MediaStoryUsage } from "./media.types";

export function MediaUsageList({ usages }: Readonly<{ usages: readonly MediaStoryUsage[] }>) {
  if (usages.length === 0) return <p className="text-sm text-muted-foreground">Not currently used by a Story</p>;
  return (
    <section aria-labelledby="media-usage-title" className="space-y-3">
      <h3 className="text-sm font-semibold" id="media-usage-title">Used by {usages.length} {usages.length === 1 ? "Story" : "Stories"}</h3>
      <ul className="space-y-2">
        {usages.map((usage) => (
          <li className="rounded-md border border-border p-3" key={usage.adminHref}>
            <Link className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={usage.adminHref}>{usage.title}</Link>
            <div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{usage.status.replaceAll("_", " ")}</Badge><Badge variant="outline">{usage.languageCode.toUpperCase()}</Badge></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
