import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const timestampVariants = cva(
  "text-sm text-muted-foreground tabular-nums",
  {
    variants: {
      format: {
        short: "",
        long: "leading-relaxed",
      },
    },
    defaultVariants: {
      format: "short",
    },
  },
);

type TimestampProps = Omit<ComponentProps<"time">, "dateTime" | "children"> &
  VariantProps<typeof timestampVariants> & {
    value: string | Date;
    locale?: string;
    display?: string;
  };

function Timestamp({
  className,
  format,
  value,
  locale,
  display,
  ...props
}: TimestampProps) {
  const date = value instanceof Date ? value : new Date(value);
  const dateTime = date.toISOString();
  const label =
    display ??
    new Intl.DateTimeFormat(locale, {
      dateStyle: format === "long" ? "long" : "medium",
      timeStyle: "short",
    }).format(date);

  return (
    <time
      dateTime={dateTime}
      className={cn(timestampVariants({ format }), className)}
      {...props}
    >
      {label}
    </time>
  );
}

export { Timestamp, timestampVariants };
