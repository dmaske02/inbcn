"use client";

import { Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { EditorActionResult } from "../../editor/homepage-editor.types.ts";
import type { HomepageLocale } from "../../homepage-builder.types.ts";
import type { HomepagePickerPage } from "../../search/homepage-picker.types.ts";
import { PickerPagination } from "./picker-pagination";
import { PickerResults } from "./picker-results";

type PickerDialogProps<T extends Readonly<{ id: string }>> = Readonly<{
  locale: HomepageLocale;
  selected: T | null;
  triggerLabel: string;
  title: string;
  description: string;
  searchLabel: string;
  emptyMessage: string;
  search(input: Readonly<{ locale: HomepageLocale; query: string; page: number }>): Promise<EditorActionResult<HomepagePickerPage<T>>>;
  renderItem(item: T): ReactNode;
  renderSelected?(item: T): ReactNode;
  onSelect(item: T): void;
}>;

export function PickerDialog<T extends Readonly<{ id: string }>>({
  locale,
  selected,
  triggerLabel,
  title,
  description,
  searchLabel,
  emptyMessage,
  search,
  renderItem,
  renderSelected,
  onSelect,
}: PickerDialogProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HomepagePickerPage<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void search({ locale, query, page }).then((response) => {
        if (sequence !== requestSequence.current) return;
        if (response.ok) setResult(response.data);
        else {
          setResult(null);
          setError(response.message);
        }
        setLoading(false);
      }).catch(() => {
        if (sequence !== requestSequence.current) return;
        setResult(null);
        setError("Results could not be loaded. Try another search.");
        setLoading(false);
      });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [locale, open, page, query, search]);

  function choose(item: T) {
    onSelect(item);
    setOpen(false);
  }

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
      <DialogPrimitive.Trigger asChild>
        <Button ref={triggerRef} variant="outline">{triggerLabel}</Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          aria-describedby={descriptionId}
          className="fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-6"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <div className="pe-10">
            <DialogPrimitive.Title className="font-heading text-xl font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-muted-foreground" id={descriptionId}>{description}</DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button aria-label={`Close ${title}`} className="absolute top-3 end-3" size="icon" variant="ghost"><X aria-hidden="true" /></Button>
          </DialogPrimitive.Close>

          {selected && renderSelected ? <div className="rounded-md border border-primary/25 bg-primary/5 p-3"><p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Current selection</p>{renderSelected(selected)}</div> : null}

          <label className="grid gap-2 text-sm font-medium">
            {searchLabel}
            <span className="relative">
              <Search aria-hidden="true" className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label={searchLabel}
                autoComplete="off"
                autoFocus
                className="min-h-11 w-full rounded-md border border-input bg-background py-2 pe-3 ps-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={120}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by name"
                type="search"
                value={query}
              />
            </span>
          </label>

          <PickerResults
            emptyMessage={emptyMessage}
            error={error}
            items={result?.items ?? []}
            loading={loading}
            onSelect={choose}
            renderItem={renderItem}
            selectedId={selected?.id}
          />
          <PickerPagination page={result?.page ?? page} totalPages={result?.totalPages ?? 0} onPageChange={setPage} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
