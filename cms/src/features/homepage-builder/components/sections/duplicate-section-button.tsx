"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DuplicateSectionButton({
  title,
  disabled,
  onDuplicate,
}: Readonly<{
  title: string;
  disabled: boolean;
  onDuplicate(): void;
}>) {
  return (
    <Button
      aria-label={`Duplicate ${title}`}
      disabled={disabled}
      onClick={onDuplicate}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Copy aria-hidden="true" />
    </Button>
  );
}
