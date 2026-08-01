import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Container } from "./container";

const headerVariants = cva(
  "sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90",
  {
    variants: {
      height: {
        default: "min-h-16",
        compact: "min-h-14",
      },
    },
    defaultVariants: {
      height: "default",
    },
  },
);

type HeaderProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof headerVariants> & {
    logo: ReactNode;
    navigation?: ReactNode;
    navigationLabel?: string;
    actions?: ReactNode;
    mobileNavigation?: ReactNode;
  };

function Header({
  className,
  height,
  logo,
  navigation,
  navigationLabel = "Primary navigation",
  actions,
  mobileNavigation,
  ...props
}: HeaderProps) {
  return (
    <header className={cn(headerVariants({ height }), className)} {...props}>
      <Container className="relative flex min-h-[inherit] items-center gap-5">
        <div className="shrink-0">{logo}</div>
        <nav
          aria-label={navigationLabel}
          className="hidden min-w-0 flex-1 items-center gap-5 lg:flex"
        >
          {navigation}
        </nav>
        <div className="ms-auto flex items-center gap-1">{actions}</div>
        <div className="lg:hidden">{mobileNavigation}</div>
      </Container>
    </header>
  );
}

export { Header, headerVariants };
