"use client";

import { cva } from "class-variance-authority";
import { usePathname } from "next/navigation";

import { LanguageSwitcher as BaseLanguageSwitcher } from "@/components/common/language-switcher";
import { routing } from "@/i18n/routing";
import type { PublicLocale } from "./types";

const languageSwitcherVariants = cva("");

const localeLabels: Record<PublicLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

type LanguageSwitcherProps = {
  locale: PublicLocale;
  label?: string;
  currentLabel?: string;
};

function LanguageSwitcher({
  locale,
  label = "Language",
  currentLabel,
}: LanguageSwitcherProps) {
  const pathname = usePathname();
  const segments = pathname.split("/");

  const locales = routing.locales.map((code) => {
    const nextSegments = [...segments];
    nextSegments[1] = code;

    return {
      code,
      label: localeLabels[code],
      href: nextSegments.join("/") || `/${code}`,
    };
  });

  return (
    <div className={languageSwitcherVariants()}>
      <BaseLanguageSwitcher
        currentLocale={locale}
        locales={locales}
        label={label}
        currentLabel={currentLabel}
      />
    </div>
  );
}

export { LanguageSwitcher, languageSwitcherVariants };
