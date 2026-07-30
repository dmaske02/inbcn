import { cva } from "class-variance-authority";

import { NavigationItem } from "@/components/layout/navigation-item";
import { cn } from "@/lib/utils";
import type { PublicLocale, PublicNavigationItem } from "./types";

const primaryNavigationVariants = cva(
  "flex min-w-0 items-center gap-4 xl:gap-5",
);

const defaultLabels = [
  ["latest", "Latest"],
  ["national", "National"],
  ["world", "World"],
  ["politics", "Politics"],
  ["business", "Business"],
  ["technology", "Technology"],
  ["sports", "Sports"],
] as const;

type PrimaryNavigationProps = {
  locale: PublicLocale;
  items?: readonly PublicNavigationItem[];
  className?: string;
};

function PrimaryNavigation({
  locale,
  items = defaultLabels.map(([slug, label]) => ({
    label,
    href: `/${locale}#${slug}`,
  })),
  className,
}: PrimaryNavigationProps) {
  return (
    <div className={cn(primaryNavigationVariants(), className)}>
      {items.map((item) => (
        <NavigationItem key={item.href} href={item.href}>
          {item.label}
        </NavigationItem>
      ))}
    </div>
  );
}

export { PrimaryNavigation, primaryNavigationVariants };
export type { PrimaryNavigationProps };
