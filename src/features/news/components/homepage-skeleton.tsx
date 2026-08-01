import { HeroCardSkeleton, ListSkeleton, StoryCardSkeleton } from "@/components/common/loading-skeletons";
import { Container } from "@/components/layout/container";
import { Grid } from "@/components/layout/grid";
import { Section } from "@/components/layout/section";
import { Skeleton } from "@/components/ui/skeleton";

export function HomepageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading homepage">
      <Skeleton className="h-11 w-full rounded-none" />
      <Container className="max-w-[1360px] px-6">
        <Section spacing="sm" className="lg:py-12">
          <Grid columns={{ base: 1, lg: 12 }} gap="lg">
            <HeroCardSkeleton className="lg:col-span-8" />
            <div className="space-y-3 border-t-2 border-foreground pt-4 lg:col-span-4">
              <Skeleton className="h-7 w-36" />
              {Array.from({ length: 4 }, (_, index) => (
                <ListSkeleton key={index} />
              ))}
            </div>
          </Grid>
        </Section>
        {Array.from({ length: 3 }, (_, sectionIndex) => (
          <Section key={sectionIndex} spacing="sm" className="lg:py-12">
            <Skeleton className="mb-6 h-7 w-44" />
            <Grid columns={{ base: 1, md: 2, lg: 4 }} gap="md">
              {Array.from({ length: 4 }, (_, cardIndex) => (
                <StoryCardSkeleton key={cardIndex} />
              ))}
            </Grid>
          </Section>
        ))}
      </Container>
    </div>
  );
}
