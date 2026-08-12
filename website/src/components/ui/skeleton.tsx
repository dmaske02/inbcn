import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const skeletonVariants = cva("animate-pulse bg-muted motion-reduce:animate-none", {
  variants: {
    shape: {
      line: "h-4 rounded-sm",
      block: "rounded-md",
      circle: "rounded-full",
    },
  },
  defaultVariants: {
    shape: "line",
  },
});

type SkeletonProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>;

function Skeleton({ className, shape, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  );
}

export { Skeleton, skeletonVariants };
