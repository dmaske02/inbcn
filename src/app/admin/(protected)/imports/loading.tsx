import { Skeleton } from "@/components/ui/skeleton";

export default function ImportsLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading imports">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-72 w-full" />
      <span className="sr-only">Loading content imports…</span>
    </div>
  );
}
