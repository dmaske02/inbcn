import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <div className="mx-auto w-full max-w-[1288px] px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading category">
      <Skeleton className="h-4 w-40" />
      <div className="mt-7 border-t-2 border-foreground pt-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-14 w-2/3" />
        <Skeleton className="mt-5 h-6 w-1/2" />
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="grid gap-5 py-6 sm:grid-cols-[200px_1fr]">
            <Skeleton className="aspect-[3/2] w-full rounded-none" />
            <div><Skeleton className="h-7 w-5/6" /><Skeleton className="mt-3 h-4 w-full" /><Skeleton className="mt-2 h-4 w-2/3" /></div>
          </div>
        ))}
      </div>
      <Skeleton className="h-[250px] rounded-none" />
      </div>
    </div>
  );
}
