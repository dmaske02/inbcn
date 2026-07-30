import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { Container } from "./container";

const signalRailVariants = cva(
  "border-b border-border border-s-4 bg-background",
  {
    variants: {
      state: {
        breaking: "border-signal",
        live: "border-signal",
        verified: "border-verified",
        corrected: "border-signal",
        developing: "border-muted-foreground",
      },
      sticky: {
        true: "sticky top-16 z-30",
        false: "",
      },
    },
    compoundVariants: [
      { state: "breaking", sticky: undefined, className: "sticky top-16 z-30" },
      { state: "live", sticky: undefined, className: "sticky top-16 z-30" },
      { state: "corrected", sticky: undefined, className: "sticky top-16 z-30" },
    ],
    defaultVariants: {
      state: "developing",
    },
  },
);

const signalLabelVariants = cva(
  "text-xs font-semibold tracking-[0.1em] uppercase",
  {
    variants: {
      state: {
        breaking: "text-signal",
        live: "text-signal",
        verified: "text-verified",
        corrected: "text-signal",
        developing: "text-foreground",
      },
    },
  },
);

type SignalRailProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> &
  VariantProps<typeof signalRailVariants> & {
    headline: string;
    href: string;
    timestamp?: string;
    label?: string;
  };

const defaultLabels = {
  breaking: "Breaking",
  live: "Live",
  verified: "Verified",
  corrected: "Corrected",
  developing: "Developing",
} as const;

function SignalRail({
  className,
  state = "developing",
  sticky,
  headline,
  href,
  timestamp,
  label,
  ...props
}: SignalRailProps) {
  return (
    <div
      className={cn(signalRailVariants({ state, sticky }), className)}
      aria-label="Editorial signal"
      {...props}
    >
      <Container className="grid min-h-11 grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 py-2 sm:flex">
        <span className={signalLabelVariants({ state })}>
          {label ?? defaultLabels[state ?? "developing"]}
        </span>
        {timestamp && (
          <time className="text-xs text-muted-foreground">{timestamp}</time>
        )}
        <Link
          href={href}
          className="col-span-2 min-w-0 text-sm font-medium hover:underline sm:col-span-1 sm:truncate"
        >
          {headline}
        </Link>
      </Container>
    </div>
  );
}

export { SignalRail, signalLabelVariants, signalRailVariants };
