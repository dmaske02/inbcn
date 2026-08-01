"use client";

import { cva } from "class-variance-authority";
import { Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { SearchTrigger as BaseSearchTrigger } from "@/components/common/search-trigger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicLocale } from "./types";

const searchTriggerVariants = cva("");
const searchPanelVariants = cva(
  "absolute inset-x-4 top-full z-50 border border-border bg-background p-4 shadow-lg sm:inset-x-auto sm:end-4 sm:w-96",
);

type SearchTriggerProps = Readonly<{
  locale: PublicLocale;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  closeLabel?: string;
  className?: string;
}>;

function SearchTrigger({
  locale,
  label = "Search",
  placeholder = "Search news",
  submitLabel = "Search",
  closeLabel = "Close search",
  className,
}: SearchTriggerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target)
        && !triggerRef.current?.contains(target)
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
    <div className="static">
      <BaseSearchTrigger
        ref={triggerRef}
        label={label}
        aria-expanded={open}
        aria-controls="public-search-panel"
        className={cn(searchTriggerVariants(), className)}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div
          id="public-search-panel"
          ref={panelRef}
          className={searchPanelVariants()}
          onKeyDown={onKeyDown}
        >
          <form
            action={`/${locale}/search`}
            method="get"
            role="search"
            aria-label={label}
            className="flex items-center gap-2"
          >
            <label htmlFor="header-search-query" className="sr-only">{label}</label>
            <input
              ref={inputRef}
              id="header-search-query"
              name="q"
              type="search"
              required
              maxLength={160}
              autoComplete="off"
              placeholder={placeholder}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <Button type="submit" size="icon" variant="signal" aria-label={submitLabel}>
              <Search aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={closeLabel}
              onClick={() => close(true)}
            >
              <X aria-hidden="true" />
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export { SearchTrigger, searchPanelVariants, searchTriggerVariants };
export type { SearchTriggerProps };
