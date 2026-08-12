"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type PickerResultsProps<T extends Readonly<{ id: string }>> = Readonly<{
  items: readonly T[];
  loading: boolean;
  error: string | null;
  selectedId?: string | null;
  emptyMessage?: string;
  renderItem(item: T): ReactNode;
  onSelect(item: T): void;
}>;

export function PickerResults<T extends Readonly<{ id: string }>>({
  items,
  loading,
  error,
  selectedId,
  emptyMessage = "No results found.",
  renderItem,
  onSelect,
}: PickerResultsProps<T>) {
  if (loading) {
    return (
      <div aria-live="polite" className="grid gap-2" role="status">
        <span className="sr-only">Loading results</span>
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-20 w-full" key={index} shape="block" />)}
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground" role="status">{emptyMessage}</p>;
  }

  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, item: T) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSelect(item);
    }
  }

  return (
    <ul aria-label="Search results" className="grid max-h-[45vh] gap-2 overflow-y-auto pe-1" role="list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            aria-pressed={item.id === selectedId}
            className="w-full rounded-md border border-border bg-background p-3 text-start transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/5"
            onClick={() => onSelect(item)}
            onKeyDown={(event) => selectWithKeyboard(event, item)}
            type="button"
          >
            {renderItem(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

