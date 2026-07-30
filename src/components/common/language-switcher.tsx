"use client";

import { cva } from "class-variance-authority";
import { Check, Languages } from "lucide-react";
import Link from "next/link";

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";

type LanguageOption = {
  code: string;
  label: string;
  href: string;
};

type LanguageSwitcherProps = {
  currentLocale: string;
  locales: readonly LanguageOption[];
  label?: string;
  currentLabel?: string;
};

const languageSwitcherVariants = cva("");

function LanguageSwitcher({
  currentLocale,
  locales,
  label = "Language",
  currentLabel = "Current language",
}: LanguageSwitcherProps) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          className={languageSwitcherVariants()}
        >
          <Languages aria-hidden="true" />
          <span className="uppercase">{currentLocale}</span>
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <DropdownLabel>{label}</DropdownLabel>
        {locales.map((locale) => (
          <DropdownItem key={locale.code} asChild>
            <Link
              href={locale.href}
              hrefLang={locale.code}
              lang={locale.code}
              className="justify-between"
            >
              <span>{locale.label}</span>
              {locale.code === currentLocale && (
                <>
                  <Check aria-hidden="true" />
                  <span className="sr-only">{currentLabel}</span>
                </>
              )}
            </Link>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

export { LanguageSwitcher, languageSwitcherVariants };
export type { LanguageOption, LanguageSwitcherProps };
