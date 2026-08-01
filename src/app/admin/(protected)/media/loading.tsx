import { Skeleton } from "@/components/ui/skeleton";

export default function MediaLibraryLoading() {
  return (
    <div aria-label="Loading media library" className="space-y-6" role="status">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(19rem,.32fr)_minmax(0,1fr)]">
        <Skeleton className="h-[32rem] w-full" />
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton className="aspect-[4/3] h-auto w-full" key={index} />)}
        </div>
      </div>
    </div>
  );
}
