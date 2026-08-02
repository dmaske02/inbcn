import { Skeleton } from "@/components/ui/skeleton";

export default function SourcesLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading sources">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-80 w-full" />
      <span className="sr-only">Loading NewsData sources…</span>
    </div>
  );
}
