"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";

export function DeleteSectionDialog({
  title,
  locale,
  open,
  disabled,
  onOpen,
  onCancel,
  onConfirm,
}: Readonly<{
  title: string;
  locale: string;
  open: boolean;
  disabled: boolean;
  onOpen(): void;
  onCancel(): void;
  onConfirm(): void;
}>) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <DialogPrimitive.Root
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpen();
        else if (open) onCancel();
      }}
      open={open}
    >
      <DialogPrimitive.Trigger asChild>
        <Button
          aria-label={`Delete ${title}`}
          disabled={disabled}
          ref={triggerRef}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="text-xl font-semibold">Delete section?</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Delete “{title}” from the {locale.toUpperCase()} homepage? This cannot be undone.
          </DialogPrimitive.Description>
          <div className="mt-6 flex justify-end gap-3">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogPrimitive.Close>
            <Button onClick={onConfirm} type="button" variant="destructive">Delete section</Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
