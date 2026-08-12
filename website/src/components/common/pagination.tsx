import { cva } from "class-variance-authority";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const paginationVariants = cva(
  "flex flex-wrap items-center justify-between gap-4",
);

type PaginationProps = HTMLAttributes<HTMLElement> & {
  previousHref?: string;
  nextHref?: string;
  currentPage: number;
  totalPages?: number;
  previousLabel?: string;
  nextLabel?: string;
  pageLabel?: string;
  ofLabel?: string;
};

function Pagination({
  className,
  previousHref,
  nextHref,
  currentPage,
  totalPages,
  previousLabel = "Previous",
  nextLabel = "Next",
  pageLabel = "Page",
  ofLabel = "of",
  ...props
}: PaginationProps) {
  return (
    <nav
      aria-label="Pagination"
      className={cn(paginationVariants(), className)}
      {...props}
    >
      {previousHref ? (
        <Link href={previousHref} rel="prev" className={buttonVariants({ variant: "outline" })}>
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {previousLabel}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground" aria-current="page">
        {pageLabel} {currentPage}
        {totalPages ? ` ${ofLabel} ${totalPages}` : ""}
      </span>
      {nextHref ? (
        <Link href={nextHref} rel="next" className={buttonVariants({ variant: "default" })}>
          {nextLabel}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export { Pagination, paginationVariants };
