import { Skeleton } from "@/components/ui/skeleton";

export default function MediaLibraryLoading() {
  return (
    <div aria-label="Loading media library" className="space-y-6" role="status">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_repeat(4,7rem)]">
        {Array.from({ length: 5 }, (_, index) => <Skeleton className="h-11 w-full" key={index} />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton className="aspect-[4/3] h-auto w-full" key={index} />)}
        </div>
        <Skeleton className="h-[32rem] w-full" />
      </div>
    </div>
  );
}
