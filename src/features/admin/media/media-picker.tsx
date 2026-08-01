"use client";

import Image from "next/image";
import Link from "next/link";
import { ImagePlus, Images, X } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaLibraryItemView } from "./media.service";

export function MediaPicker({
  options,
  initialId,
  canManage,
}: Readonly<{
  options: readonly MediaLibraryItemView[];
  initialId: string | null;
  canManage: boolean;
}>) {
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.id === selectedId) ?? null;

  if (!canManage) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-4">
        <input name="featuredMediaId" type="hidden" value={initialId ?? ""} />
        <p className="text-sm font-medium">Featured image</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Featured media is managed by editors and administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input name="featuredMediaId" type="hidden" value={selectedId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Featured image</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a reusable image from the newsroom library.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen((value) => !value)} size="sm" type="button" variant="outline">
            <Images aria-hidden="true" />{open ? "Close library" : "Choose existing"}
          </Button>
          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/admin/media" target="_blank">
            <ImagePlus aria-hidden="true" />Upload new
          </Link>
        </div>
      </div>

      {selected ? (
        <div className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border p-3">
          <div className="relative aspect-video overflow-hidden rounded-sm bg-muted">
            <Image alt="" className="object-cover" fill sizes="128px" src={selected.deliveryUrl} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected.altText}</p>
          </div>
          <Button aria-label="Remove featured image" onClick={() => setSelectedId("")} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No featured image selected. The public fallback image will be used.
        </div>
      )}

      {open ? (
        <div className="rounded-md border border-border bg-background p-3">
          {options.length > 0 ? (
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pe-1 sm:grid-cols-3">
              {options.map((item) => (
                <button
                  aria-pressed={selectedId === item.id}
                  className={cn(
                    "overflow-hidden rounded-md border text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selectedId === item.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/40",
                  )}
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="relative block aspect-video bg-muted">
                    <Image alt="" className="object-cover" fill sizes="160px" src={item.deliveryUrl} />
                  </span>
                  <span className="block truncate p-2 text-xs font-medium">{item.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              No images are available yet. Upload one in the Media Library, then reopen this editor.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
