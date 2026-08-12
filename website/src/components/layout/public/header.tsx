import { cva } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import type { PublicLocale } from "./types";

const headerVariants = cva(
  "sticky top-0 z-40 border-b border-[#14110f] bg-[#fbf9f5]",
);

type HeaderProps = HTMLAttributes<HTMLElement> & {
  locale: PublicLocale;
  primaryNavigation?: ReactNode;
  mobileNavigation?: ReactNode;
  search?: ReactNode;
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
  languageLabel,
  currentLanguageLabel,
  navigationLabel,
  ...props
}: HeaderProps) {
  return (
    <header className={cn(headerVariants(), className)} {...props}>
      <Container>
        <div className="flex min-h-[60px] items-center gap-5 sm:min-h-[64px] sm:gap-8">
          <Logo href={`/${locale}`} size="lg" imagePreload />
          <div className="ms-auto flex min-w-0 items-center gap-2">
            {search}
            <div className="hidden sm:block">
              <LanguageSwitcher locale={locale} label={languageLabel} currentLabel={currentLanguageLabel} />
            </div>
            <div className="lg:hidden">{mobileNavigation}</div>
          </div>
        </div>
        <nav aria-label={navigationLabel} className="hidden min-w-0 border-t border-[#e3ddd3] lg:block">
          {primaryNavigation}
        </nav>
      </Container>
    </header>
  );
}

export { Header, headerVariants };
