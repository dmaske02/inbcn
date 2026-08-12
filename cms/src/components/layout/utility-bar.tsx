import { cva } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Container } from "./container";

const utilityBarVariants = cva(
  "border-b border-border bg-muted/40 text-xs text-muted-foreground",
);

type UtilityBarProps = HTMLAttributes<HTMLDivElement> & {
  date: ReactNode;
  weather?: ReactNode;
  market?: ReactNode;
  liveLabel?: ReactNode;
};

function UtilityBar({
  className,
  date,
  weather,
  market,
  liveLabel,
  ...props
}: UtilityBarProps) {
  return (
    <div className={cn(utilityBarVariants(), className)} {...props}>
      <Container className="flex min-h-9 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span>{date}</span>
          {weather && <span className="hidden sm:inline">{weather}</span>}
        </div>
        <div className="flex items-center gap-3">
          {market && <span className="hidden md:inline">{market}</span>}
          {liveLabel && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span className="size-1.5 rounded-full bg-signal" aria-hidden="true" />
              {liveLabel}
            </span>
          )}
        </div>
      </Container>
    </div>
  );
}

export { UtilityBar, utilityBarVariants };
