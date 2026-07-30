"use client";

import { cva } from "class-variance-authority";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicLocale, PublicNavigationItem } from "./types";

const mobileNavigationVariants = cva(
  "absolute inset-x-0 top-full z-50 border-b border-border bg-background shadow-md lg:hidden",
);

const defaultItems = [
  ["national", "National"],
  ["world", "World"],
  ["business", "Business"],
  ["technology", "Technology"],
  ["sports", "Sports"],
  ["entertainment", "Entertainment"],
  ["opinion", "Opinion"],
] as const;

type MobileNavigationProps = {
  locale: PublicLocale;
  items?: readonly PublicNavigationItem[];
  label?: string;
  closeLabel?: string;
  themeLabel?: string;
  lightThemeLabel?: string;
  darkThemeLabel?: string;
};

function MobileNavigation({
  locale,
  items = defaultItems.map(([slug, label]) => ({
    label,
    href: `/${locale}#${slug}`,
  })),
  label = "Menu",
  closeLabel = "Close menu",
  themeLabel = "Theme",
  lightThemeLabel,
  darkThemeLabel,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>("a");
    firstLink?.focus();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        close();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [close, open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={open ? closeLabel : label}
        aria-expanded={open}
        aria-controls="public-mobile-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>
      {open && (
        <div
          id="public-mobile-navigation"
          ref={panelRef}
          className={cn(mobileNavigationVariants())}
          onKeyDown={onKeyDown}
        >
          <nav
            aria-label={label}
            className="mx-auto grid max-w-7xl gap-1 px-4 py-4 sm:grid-cols-2 sm:px-6"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center border-b border-border px-2 text-base font-medium hover:bg-accent"
                onClick={() => close()}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex min-h-11 items-center justify-between px-2 sm:col-span-2">
              <span className="text-sm text-muted-foreground">{themeLabel}</span>
              <ThemeToggle
                lightLabel={lightThemeLabel}
                darkLabel={darkThemeLabel}
              />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

export { MobileNavigation, mobileNavigationVariants };
export type { MobileNavigationProps };
