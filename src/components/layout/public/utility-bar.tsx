"use client";

import { cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import type { PublicLocale } from "./types";

const utilityBarVariants = cva("bg-[#14110f] text-[#b9b0a5]");

type UtilityBarProps = HTMLAttributes<HTMLDivElement> & {
  locale: PublicLocale;
  dateLabel?: string;
  weather?: string;
  market?: string;
  liveLabel?: string;
  tagline?: string;
};

function UtilityBar({
  className,
  locale,
  dateLabel,
  weather,
  market,
  liveLabel,
  tagline = "India-first news in English, Hindi and Marathi",
  ...props
}: UtilityBarProps) {
  void market;
  void liveLabel;
  const date = dateLabel ?? new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className={cn(utilityBarVariants(), className)} {...props}>
      <Container className="flex min-h-[38px] items-center gap-3 text-[12px]">
        <time suppressHydrationWarning className="shrink-0 text-[#f6f3ed]">{date}</time>
        <span className="h-3 w-px shrink-0 bg-[#3a3430]" aria-hidden="true" />
        <span className="hidden truncate sm:inline">{tagline}</span>
        <div className="ms-auto flex shrink-0 items-center gap-2">
          {weather ? <span className="hidden rounded-[2px] border border-[#3a3430] px-2 py-1 md:inline">{weather}</span> : null}
          <LanguageSwitcher locale={locale} label="Language" />
        </div>
      </Container>
    </div>
  );
}

export { UtilityBar, utilityBarVariants };
