import { cva } from "class-variance-authority";
import { Menu } from "lucide-react";
import type { DetailsHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

const responsiveNavigationVariants = cva(
  "relative [&_summary::-webkit-details-marker]:hidden",
);

type ResponsiveNavigationProps = DetailsHTMLAttributes<HTMLDetailsElement> & {
  label: string;
  children: ReactNode;
};

function ResponsiveNavigation({
  className,
  label,
  children,
  ...props
}: ResponsiveNavigationProps) {
  return (
    <details
      className={cn(responsiveNavigationVariants(), className)}
      {...props}
    >
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-md hover:bg-accent">
        <Menu className="size-5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </summary>
      <nav
        aria-label={label}
        className="absolute end-0 top-full z-50 mt-2 flex min-w-56 flex-col rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
      >
        {children}
      </nav>
    </details>
  );
}

export { ResponsiveNavigation, responsiveNavigationVariants };
