import { cva, type VariantProps } from "class-variance-authority";
import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const navigationItemVariants = cva(
  "inline-flex min-h-11 items-center border-b-[3px] text-[13.5px] font-medium transition-colors",
  {
    variants: {
      active: {
        true: "border-signal text-foreground",
        false:
          "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

type NavigationItemProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  VariantProps<typeof navigationItemVariants>;

function NavigationItem({
  className,
  active,
  ...props
}: NavigationItemProps) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(navigationItemVariants({ active }), className)}
      {...props}
    />
  );
}

export { NavigationItem, navigationItemVariants };
