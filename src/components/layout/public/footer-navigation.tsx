import { cva } from "class-variance-authority";
import Link from "next/link";

import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import type { PublicFooterGroup, PublicLocale } from "./types";

const footerNavigationVariants = cva("space-y-7");

type FooterNavigationProps = {
  locale: PublicLocale;
  groups?: readonly PublicFooterGroup[];
  className?: string;
};

function FooterNavigation({
  locale,
  groups = [
    {
      label: "Explore",
      items: [
        { label: "Latest", href: `/${locale}#latest` },
        { label: "Search", href: `/${locale}#search` },
      ],
    },
    {
      label: "Trust",
      items: [
        { label: "About", href: `/${locale}#about` },
        { label: "Corrections", href: `/${locale}#corrections` },
        { label: "Contact", href: `/${locale}#contact` },
      ],
    },
  ],
  className,
}: FooterNavigationProps) {
  return (
    <div
      className={cn(
        footerNavigationVariants(),
        "grid gap-8 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3",
        className,
      )}
    >
      {groups.map((group) => (
        <nav key={group.label} aria-label={group.label}>
          <Typography variant="label" className="mb-3">
            {group.label}
          </Typography>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}

export { FooterNavigation, footerNavigationVariants };
export type { FooterNavigationProps };
