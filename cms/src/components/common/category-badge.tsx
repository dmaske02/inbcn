import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const categoryBadgeVariants = cva(
  "border-0 bg-transparent px-0 py-0 text-[10px] font-bold tracking-[0.14em] text-[#b3261e] uppercase",
  {
    variants: {
      emphasis: {
        default: "",
        signal: "text-signal",
      },
    },
    defaultVariants: {
      emphasis: "default",
    },
  },
);

type CategoryBadgeProps = ComponentProps<typeof Badge> &
  VariantProps<typeof categoryBadgeVariants>;

function CategoryBadge({
  className,
  emphasis,
  ...props
}: CategoryBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(categoryBadgeVariants({ emphasis }), className)}
      {...props}
    />
  );
}

export { CategoryBadge, categoryBadgeVariants };
