import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const pageVariants = cva("min-h-dvh bg-background text-foreground", {
  variants: {
    density: {
      comfortable: "leading-relaxed",
      compact: "leading-normal",
    },
  },
  defaultVariants: {
    density: "comfortable",
  },
});

type PageProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof pageVariants>;

function Page({ className, density, ...props }: PageProps) {
  return (
    <div className={cn(pageVariants({ density }), className)} {...props} />
  );
}

export { Page, pageVariants };
