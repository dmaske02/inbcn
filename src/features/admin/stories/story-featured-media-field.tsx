"use client";

import Image from "next/image";
import { ImageOff, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/features/admin/media/components/media-picker";
import type { MediaLibraryItemView } from "@/features/admin/media/media.service";

export function StoryFeaturedMediaField({
  initialId,
  currentMedia,
  canManage,
}: Readonly<{
  initialId: string | null;
  currentMedia: MediaLibraryItemView | null;
  canManage: boolean;
}>) {
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const [selectedMedia, setSelectedMedia] = useState(currentMedia);
  const [pickerOpen, setPickerOpen] = useState(false);

  function selectMedia(media: MediaLibraryItemView) {
    setSelectedId(media.id);
    setSelectedMedia(media);
  }

  return (
    <section aria-labelledby="featured-media-label" className="space-y-3">
      <input name="featuredMediaId" type="hidden" value={selectedId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-medium" id="featured-media-label">Featured image</h3><p className="mt-1 text-xs text-muted-foreground">Choose one active Media Library image for Story cards and public presentation.</p></div>
        {canManage ? <MediaPicker allowedType="image" onCancel={() => undefined} onOpenChange={setPickerOpen} onSelect={selectMedia} open={pickerOpen} selectedMediaId={selectedId || null} title="Choose featured media" trigger={<span>{selectedId ? "Change media" : "Choose media"}</span>} /> : null}
      </div>

      {selectedMedia && selectedMedia.id === selectedId ? (
        <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
          <div className="relative aspect-video overflow-hidden rounded-sm bg-muted"><Image alt="" className="object-cover" fill sizes="128px" src={selectedMedia.thumbnailUrl} /></div>
          <div className="min-w-0"><p className="truncate text-sm font-medium">{selectedMedia.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{selectedMedia.originalFilename || "Filename unavailable"}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selectedMedia.altText || "No alt text"}</p></div>
          {canManage ? <Button aria-label="Remove featured image" onClick={() => { setSelectedId(""); setSelectedMedia(null); }} size="icon" type="button" variant="ghost"><X aria-hidden="true" /></Button> : null}
        </div>
      ) : selectedId ? (
        <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/5 p-4"><ImageOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><div><p className="text-sm font-medium">Featured media is unavailable</p><p className="mt-1 text-xs text-muted-foreground">The saved media is missing or retired. Choose a replacement when permitted; the Story will not change until saved.</p></div></div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No featured image selected. The public fallback image will be used.</div>
      )}

      {!canManage ? <p className="text-xs text-muted-foreground">Featured media is managed by editors and administrators.</p> : null}
      <p aria-live="polite" className="sr-only">{selectedMedia && selectedMedia.id === selectedId ? `Selected featured media: ${selectedMedia.title}` : selectedId ? "Featured media is unavailable" : "No featured image selected"}</p>
    </section>
  );
}
