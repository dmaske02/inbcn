import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

export function HomepageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading homepage">
      <Skeleton className="h-12 w-full rounded-none" />
      <Container className="py-8">
        <Skeleton className="h-[90px] w-full rounded-none" />
        <div className="mt-7 grid gap-8 border-b-2 border-[#14110f] pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-7 md:grid-cols-[1.55fr_1fr]"><div><Skeleton className="aspect-video w-full rounded-none" /><Skeleton className="mt-4 h-9 w-4/5" /><Skeleton className="mt-3 h-5 w-full" /></div><div className="space-y-5">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-none" />)}</div></div>
          <Skeleton className="h-[420px] w-full rounded-none" />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="grid gap-6 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i}><Skeleton className="aspect-[3/2] w-full rounded-none" /><Skeleton className="mt-3 h-7 w-full" /></div>)}</div><Skeleton className="h-[250px] rounded-none" /></div>
      </Container>
    </div>
  );
}
