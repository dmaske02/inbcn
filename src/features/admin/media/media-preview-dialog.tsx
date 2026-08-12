"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { Expand, FileImage, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MediaLibraryItemView } from "./media.service";
import { MediaMetadataEditor } from "./media-metadata-editor";
import { MediaUsageList } from "./media-usage-list";
import { MediaLifecycleControls } from "./media-lifecycle-controls";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreviewDialog({ item }: Readonly<{ item: MediaLibraryItemView }>) {
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const confirmDiscard = useCallback(() => !dirty || window.confirm("Discard unsaved changes?"), [dirty]);
  const created = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(item.createdAt));
  const dimensions = item.width && item.height ? `${item.width}×${item.height}` : "Unknown";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (next || confirmDiscard()) setOpen(next); }}>
      <DialogPrimitive.Trigger asChild>
        <Button aria-label={`Preview ${item.title}`} className="w-full" variant="outline">
          <Expand aria-hidden="true" /> Preview
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content onEscapeKeyDown={(event) => { if (!confirmDiscard()) event.preventDefault(); }} onInteractOutside={(event) => { if (!confirmDiscard()) event.preventDefault(); }} className="fixed inset-x-3 top-1/2 z-50 max-h-[calc(100dvh-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-md border border-border bg-background shadow-xl focus:outline-none sm:inset-x-auto sm:left-1/2 sm:w-[min(64rem,calc(100vw-3rem))] sm:-translate-x-1/2">
          <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">{item.title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">Asset preview and file details</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button aria-label="Close preview" className="shrink-0" size="icon" variant="ghost"><X aria-hidden="true" /></Button>
            </DialogPrimitive.Close>
          </div>
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,.75fr)]">
            <div className="relative min-h-64 bg-muted lg:min-h-[32rem]">
              {item.mediaType === "image" ? (
                <Image alt={item.altText || item.title} className="object-contain" fill sizes="(min-width: 1024px) 60vw, 100vw" src={item.deliveryUrl} />
              ) : (
                <div className="flex min-h-64 items-center justify-center"><FileImage aria-hidden="true" className="size-16 text-muted-foreground" /></div>
              )}
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              <Badge variant="secondary">{item.mediaType}</Badge>
              <dl className="grid gap-4 text-sm">
                <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filename</dt><dd className="mt-1 break-all">{item.originalFilename || "Unavailable"}</dd></div>
                <div className="grid grid-cols-2 gap-3"><div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dimensions</dt><dd className="mt-1">{dimensions}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">File size</dt><dd className="mt-1">{formatBytes(item.bytes)}</dd></div></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</dt><dd className="mt-1">{created}</dd></div>
                {item.credit ? <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit</dt><dd className="mt-1">{item.credit}</dd></div> : null}
              </dl>
              {item.isRetired ? <Badge variant="signal">Retired</Badge> : null}
              <MediaUsageList usages={item.usages} />
              {!item.isRetired ? <div className="border-t border-border pt-5"><MediaMetadataEditor item={item} onDirtyChange={setDirty} /></div> : null}
              <MediaLifecycleControls item={item} />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
