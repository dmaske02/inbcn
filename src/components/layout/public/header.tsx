"use client";

import { cva } from "class-variance-authority";
import {
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";

import { Header as BaseHeader } from "@/components/layout/header";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import type { PublicLocale } from "./types";

const headerVariants = cva(
  "relative transition-[min-height,box-shadow] duration-150 motion-reduce:transition-none",
  {
    variants: {
      compressed: {
        true: "shadow-sm",
        false: "shadow-none",
      },
    },
  },
);

type HeaderProps = Omit<
  ComponentProps<typeof BaseHeader>,
  "logo" | "navigation" | "actions" | "mobileNavigation" | "height"
> & {
  locale: PublicLocale;
  primaryNavigation?: ReactNode;
  mobileNavigation?: ReactNode;
  search?: ReactNode;
  theme?: ReactNode;
  languageLabel?: string;
  currentLanguageLabel?: string;
  navigationLabel?: string;
};

function Header({
  className,
  locale,
  primaryNavigation,
  mobileNavigation,
  search,
  theme,
  languageLabel,
  currentLanguageLabel,
  navigationLabel,
  ...props
}: HeaderProps) {
  const compressed = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("scroll", onStoreChange, { passive: true });
      return () => window.removeEventListener("scroll", onStoreChange);
    },
    () => window.scrollY > 24,
    () => false,
  );

  return (
    <BaseHeader
      logo={<Logo href={`/${locale}`} />}
      navigation={primaryNavigation}
      navigationLabel={navigationLabel}
      actions={
        <>
          {search}
          <LanguageSwitcher
            locale={locale}
            label={languageLabel}
            currentLabel={currentLanguageLabel}
          />
          <span className="hidden sm:inline-flex">{theme}</span>
        </>
      }
      mobileNavigation={mobileNavigation}
      height={compressed ? "compact" : "default"}
      className={cn(headerVariants({ compressed }), className)}
      {...props}
    />
  );
}

export { Header, headerVariants };
