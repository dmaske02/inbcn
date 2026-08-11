"use client";

import { Button } from "@/components/ui/button";

type PickerPaginationProps = Readonly<{
  page: number;
  totalPages: number;
  onPageChange(page: number): void;
}>;

export function PickerPagination({ page, totalPages, onPageChange }: PickerPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Picker pagination" className="flex items-center justify-between gap-4 border-t border-border pt-4">
      <Button
        aria-label="Previous results page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        size="sm"
        variant="outline"
      >
        Previous
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <Button
        aria-label="Next results page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        size="sm"
        variant="outline"
      >
        Next
      </Button>
    </nav>
  );
}

