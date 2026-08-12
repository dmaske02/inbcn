"use client";

import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Images, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchMediaPickerAction } from "../media.actions";
import type { MediaLibraryItemView, MediaPickerPage } from "../media.service";

export type MediaPickerProps = Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  selectedMediaId?: string | null;
  onSelect(media: MediaLibraryItemView): void;
  onCancel?(): void;
  trigger?: ReactNode;
  allowedType?: "all" | "image";
  title?: string;
}>;

export function MediaPicker({
  open,
  onOpenChange,
  selectedMediaId = null,
  onSelect,
  onCancel,
  trigger,
  allowedType = "all",
  title = "Select Media",
}: MediaPickerProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "image">(allowedType);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<MediaPickerPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);
  const [draftSelectedId, setDraftSelectedId] = useState(selectedMediaId ?? "");
  const [draftSelectedItem, setDraftSelectedItem] = useState<MediaLibraryItemView | null>(null);
  const requestSequence = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const selectedItem = draftSelectedItem?.id === draftSelectedId
    ? draftSelectedItem
    : result?.items.find((item) => item.id === draftSelectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchMediaPickerAction({ query, page, type }).then((response) => {
        if (sequence !== requestSequence.current) return;
        if (response.ok) {
          setResult(response.data);
        }
        else setError(response.message);
        setLoading(false);
      }).catch(() => {
        if (sequence !== requestSequence.current) return;
        setError("Unable to load media. Try again.");
        setLoading(false);
      });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [open, page, query, retrySequence, type]);

  function cancel() {
    setDraftSelectedId(selectedMediaId ?? "");
    setDraftSelectedItem(null);
    onCancel?.();
    onOpenChange(false);
  }

  function confirm() {
    if (!selectedItem) return;
    onSelect(selectedItem);
    onOpenChange(false);
  }

  const emptyMessage = query
    ? "No media matches your search."
    : type !== "all"
      ? "No media matches this filter."
      : page > 1
        ? "This page has no media."
        : "No media assets available.";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (next) { setDraftSelectedId(selectedMediaId ?? ""); setDraftSelectedItem(null); onOpenChange(true); } else cancel(); }}>
      {trigger ? <DialogPrimitive.Trigger asChild><Button ref={triggerRef} variant="outline">{trigger}</Button></DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <DialogPrimitive.Content aria-describedby={descriptionId} className="fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[min(58rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-2xl sm:p-6" onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
          <div className="pe-12"><DialogPrimitive.Title className="font-heading text-xl font-semibold">{title}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground" id={descriptionId}>Browse active media and choose one asset. Selection is not saved until you confirm.</DialogPrimitive.Description></div>
          <DialogPrimitive.Close asChild><Button aria-label={`Close ${title}`} className="absolute end-3 top-3" size="icon" variant="ghost"><X aria-hidden="true" /></Button></DialogPrimitive.Close>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="relative"><span className="sr-only">Search media</span><Search aria-hidden="true" className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Search media" autoFocus className="min-h-11 w-full rounded-md border border-input bg-background pe-3 ps-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search media..." type="search" value={query} /></label>
            <select aria-label="Media type" className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={allowedType === "image"} onChange={(event) => { setType(event.target.value === "image" ? "image" : "all"); setPage(1); }} value={type}><option value="all">All media</option><option value="image">Images</option></select>
          </div>

          <div aria-busy={loading} aria-live="polite" className="min-h-72">
            {error ? <div className="flex min-h-72 flex-col items-center justify-center text-center" role="alert"><p>Unable to load media. Try again.</p><Button className="mt-4" onClick={() => { setError(null); setRetrySequence((value) => value + 1); }} variant="outline">Retry</Button></div> : result?.items.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((item) => (
                  <button aria-label={`Select ${item.title}`} aria-pressed={draftSelectedId === item.id} className={cn("group relative overflow-hidden rounded-md border bg-card text-start outline-none transition focus-visible:ring-2 focus-visible:ring-ring", draftSelectedId === item.id ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/40")} key={item.id} onClick={() => { setDraftSelectedId(item.id); setDraftSelectedItem(item); }} type="button">
                    <span className="relative block aspect-video bg-muted"><Image alt="" className="object-cover" fill loading="lazy" sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 90vw" src={item.thumbnailUrl} />{draftSelectedId === item.id ? <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Check aria-hidden="true" className="size-4" /><span className="sr-only">Selected</span></span> : null}</span>
                    <span className="block min-w-0 p-3"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.originalFilename || item.mediaType}{item.width && item.height ? ` · ${item.width}×${item.height}` : ""}</span></span>
                  </button>
                ))}
              </div>
            ) : loading ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">Loading media…</div> : <div className="flex min-h-72 items-center justify-center text-center text-sm text-muted-foreground">{emptyMessage}</div>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2"><Button disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} variant="outline"><ChevronLeft aria-hidden="true" />Previous</Button><span className="text-sm text-muted-foreground">Page {result?.page ?? page} of {result?.totalPages ?? 1}</span><Button disabled={loading || page >= (result?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} variant="outline">Next<ChevronRight aria-hidden="true" /></Button></div>
            <div className="flex gap-2"><Button onClick={cancel} variant="ghost">Cancel</Button><Button disabled={!selectedItem} onClick={confirm}><Images aria-hidden="true" />Select</Button></div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
