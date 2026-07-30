import { cva } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";
import type { PublicLocale } from "./types";

const footerVariants = cva(
  "border-t-2 border-foreground bg-background py-10 sm:py-12",
);

type FooterProps = HTMLAttributes<HTMLElement> & {
  locale: PublicLocale;
  navigation?: ReactNode;
  description?: ReactNode;
  copyright?: ReactNode;
};

function Footer({
  className,
  locale,
  navigation,
  description,
  copyright,
  ...props
}: FooterProps) {
  return (
    <footer className={cn(footerVariants(), className)} {...props}>
      <Container>
        <div className="grid gap-8 lg:grid-cols-4">
          <div>
            <Logo href={`/${locale}`} size="lg" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          {navigation}
        </div>
        <div className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          {copyright ?? `© ${new Date().getFullYear()} INBCN`}
        </div>
      </Container>
    </footer>
  );
}

export { Footer, footerVariants };
