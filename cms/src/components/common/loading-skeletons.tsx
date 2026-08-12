import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const loadingSkeletonVariants = cva("space-y-3", {
  variants: {
    variant: {
      story: "",
      hero: "grid gap-6 lg:grid-cols-2",
      list: "border-b border-border py-4",
    },
  },
  defaultVariants: {
    variant: "story",
  },
});

type LoadingSkeletonProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof loadingSkeletonVariants>;

function LoadingSkeleton({
  className,
  variant = "story",
  ...props
}: LoadingSkeletonProps) {
  const text = (
    <div className="space-y-3">
      <Skeleton className="w-24" />
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-7 w-4/5" />
      <Skeleton className="w-40" />
    </div>
  );

  return (
    <div
      role="status"
      aria-label="Loading content"
      className={cn(loadingSkeletonVariants({ variant }), className)}
      {...props}
    >
      {variant !== "list" && (
        <Skeleton shape="block" className="aspect-video h-auto w-full" />
      )}
      {text}
    </div>
  );
}

function StoryCardSkeleton(props: Omit<LoadingSkeletonProps, "variant">) {
  return <LoadingSkeleton variant="story" {...props} />;
}

function HeroCardSkeleton(props: Omit<LoadingSkeletonProps, "variant">) {
  return <LoadingSkeleton variant="hero" {...props} />;
}

function ListSkeleton(props: Omit<LoadingSkeletonProps, "variant">) {
  return <LoadingSkeleton variant="list" {...props} />;
}

export {
  HeroCardSkeleton,
  ListSkeleton,
  LoadingSkeleton,
  StoryCardSkeleton,
  loadingSkeletonVariants,
};
