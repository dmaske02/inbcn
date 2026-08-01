import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-10" aria-busy="true" aria-label="Loading category">
      <Skeleton className="h-4 w-40" />
      <div className="mt-7 border-t-2 border-foreground pt-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-14 w-2/3" />
        <Skeleton className="mt-5 h-6 w-1/2" />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="aspect-video w-full" />
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-7 w-5/6" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
