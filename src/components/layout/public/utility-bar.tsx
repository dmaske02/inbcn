"use client";

import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { UtilityBar as BaseUtilityBar } from "@/components/layout/utility-bar";
import { cn } from "@/lib/utils";
import type { PublicLocale } from "./types";

const utilityBarVariants = cva("");

type UtilityBarProps = Omit<ComponentProps<typeof BaseUtilityBar>, "date"> & {
  locale: PublicLocale;
  dateLabel?: string;
};

function UtilityBar({
  className,
  locale,
  dateLabel,
  weather = "Weather —",
  market = "Market —",
  liveLabel = "Live",
  ...props
}: UtilityBarProps) {
  const date =
    dateLabel ??
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());

  return (
    <BaseUtilityBar
      date={<time suppressHydrationWarning>{date}</time>}
      weather={weather}
      market={market}
      liveLabel={liveLabel}
      className={cn(utilityBarVariants(), className)}
      {...props}
    />
  );
}

export { UtilityBar, utilityBarVariants };
