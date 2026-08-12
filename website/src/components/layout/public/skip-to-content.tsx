import { cva } from "class-variance-authority";
import type { AnchorHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const skipToContentVariants = cva(
  "fixed start-4 top-4 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-md transition-transform focus:translate-y-0 motion-reduce:transition-none",
);

type SkipToContentProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  targetId?: string;
  label?: string;
};

function SkipToContent({
  className,
  targetId = "main-content",
  label = "Skip to main content",
  ...props
}: SkipToContentProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(skipToContentVariants(), className)}
      {...props}
    >
      {label}
    </a>
  );
}

export { SkipToContent, skipToContentVariants };
