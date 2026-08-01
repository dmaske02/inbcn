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
  "bg-background transition-[box-shadow,border-color] duration-200 ease-out supports-[backdrop-filter]:bg-background motion-reduce:transition-none",
  {
    variants: {
      stuck: {
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
  const stuck = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("scroll", onStoreChange, { passive: true });
      return () => window.removeEventListener("scroll", onStoreChange);
    },
    () => window.scrollY > 36,
    () => false,
  );

  return (
    <BaseHeader
      logo={<Logo href={`/${locale}`} imagePreload />}
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
      height="default"
      className={cn(headerVariants({ stuck }), className)}
      {...props}
    />
  );
}

export { Header, headerVariants };
