import { cva } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Container } from "./container";

const footerVariants = cva(
  "border-t-2 border-foreground bg-background py-10 sm:py-12",
);

type FooterProps = HTMLAttributes<HTMLElement> & {
  brand: ReactNode;
  explore?: ReactNode;
  categories?: ReactNode;
  languages?: ReactNode;
  legal?: ReactNode;
  social?: ReactNode;
  copyright?: ReactNode;
};

function Footer({
  className,
  brand,
  explore,
  categories,
  languages,
  legal,
  social,
  copyright,
  ...props
}: FooterProps) {
  return (
    <footer className={cn(footerVariants(), className)} {...props}>
      <Container>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">{brand}</div>
          {explore && <nav aria-label="Explore">{explore}</nav>}
          {categories && <nav aria-label="Categories">{categories}</nav>}
          {languages && <nav aria-label="Languages">{languages}</nav>}
          <div className="space-y-4">
            {legal && <nav aria-label="Legal">{legal}</nav>}
            {social && <nav aria-label="Social media">{social}</nav>}
          </div>
        </div>
        {copyright && (
          <div className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
            {copyright}
          </div>
        )}
      </Container>
    </footer>
  );
}

export { Footer, footerVariants };
