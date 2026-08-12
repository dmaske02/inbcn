import { cva } from "class-variance-authority";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

const breadcrumbVariants = cva(
  "flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground",
);

type BreadcrumbProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  items: readonly BreadcrumbItem[];
  label?: string;
};

function Breadcrumb({
  className,
  items,
  label = "Breadcrumb",
  ...props
}: BreadcrumbProps) {
  return (
    <nav
      aria-label={label}
      className={cn(breadcrumbVariants(), className)}
      {...props}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
              )}
              {item.href && !current ? (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={current ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Breadcrumb, breadcrumbVariants };
export type { BreadcrumbItem, BreadcrumbProps };
