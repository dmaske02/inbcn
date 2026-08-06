import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { Container } from "./container";

const signalRailVariants = cva(
  "border-b",
  {
    variants: {
      state: {
        breaking: "border-[#8f1d16] bg-[#b3261e] text-white",
        live: "border-[#8f1d16] bg-[#b3261e] text-white",
        verified: "border-[#b9dcc8] bg-[#dff0e6] text-[#1f6f4a]",
        corrected: "border-[#8f1d16] bg-[#b3261e] text-white",
        developing: "border-[#e3ddd3] bg-[#fbf9f5] text-[#14110f]",
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
        breaking: "text-white",
        live: "text-white",
        verified: "text-verified",
        corrected: "text-white",
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
      <Container className="grid min-h-[48px] grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 py-2 sm:flex">
        <span className={cn(signalLabelVariants({ state }), "border border-current/50 px-2 py-1 text-[10px] tracking-[0.14em]")}>
          {label ?? defaultLabels[state ?? "developing"]}
        </span>
        {timestamp && (
          <time className="text-xs opacity-75">{timestamp}</time>
        )}
        <Link
          href={href}
          className="font-heading col-span-2 min-w-0 text-[16px] font-semibold leading-snug hover:underline sm:col-span-1 sm:truncate"
        >
          {headline}
        </Link>
      </Container>
    </div>
  );
}

export { SignalRail, signalLabelVariants, signalRailVariants };
