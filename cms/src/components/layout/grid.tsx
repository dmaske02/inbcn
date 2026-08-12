import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type GridColumnCount = 1 | 2 | 3 | 4 | 12;

const baseColumns: Record<GridColumnCount, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  12: "grid-cols-12",
};

const mediumColumns: Record<GridColumnCount, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  12: "md:grid-cols-12",
};

const largeColumns: Record<GridColumnCount, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  12: "lg:grid-cols-12",
};

const gridVariants = cva("grid", {
  variants: {
    gap: {
      sm: "gap-3 sm:gap-4",
      md: "gap-4 sm:gap-5 lg:gap-6",
      lg: "gap-6 lg:gap-8",
    },
  },
  defaultVariants: {
    gap: "md",
  },
});

type GridProps = HTMLAttributes<HTMLDivElement> & {
  columns?: {
    base?: GridColumnCount;
    md?: GridColumnCount;
    lg?: GridColumnCount;
  };
  gap?: "sm" | "md" | "lg";
};

function Grid({
  className,
  columns = { base: 1 },
  gap,
  ...props
}: GridProps) {
  return (
    <div
      className={cn(
        gridVariants({ gap }),
        columns.base && baseColumns[columns.base],
        columns.md && mediumColumns[columns.md],
        columns.lg && largeColumns[columns.lg],
        className,
      )}
      {...props}
    />
  );
}

export { Grid, gridVariants };
export type { GridColumnCount, GridProps };
