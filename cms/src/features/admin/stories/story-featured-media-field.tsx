"use client";

import Image from "next/image";
import { ImageOff, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { MediaPicker } from "@/features/admin/media/components/media-picker";
import {
  uploadStoryFeaturedMediaAction,
  type StoryFeaturedMediaUploadState,
} from "@/features/admin/media/media.actions";
import type { MediaLibraryItemView } from "@/features/admin/media/media.service";

const uploadInitialState: StoryFeaturedMediaUploadState = { status: "idle" };
const control = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted";

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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function selectMedia(media: MediaLibraryItemView) {
    setSelectedId(media.id);
    setSelectedMedia(media);
  }

  function resetUpload() {
    setSelectedFile(null);
    setTitle("");
    setAltText("");
    setCaption("");
    setCredit("");
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeUpload() {
    if (pending) return;
    setUploadOpen(false);
    resetUpload();
  }

  function chooseFile(file: File | null) {
    if (!file) return;
    setSelectedFile(file);
    setUploadError(null);
    setUploadOpen(true);
  }

  function uploadSelectedFile() {
    if (pending || !selectedFile) return;
    if (!title.trim()) {
      setUploadError("Enter an image title.");
      return;
    }
    if (!altText.trim()) {
      setUploadError("Enter alt text that describes the image.");
      return;
    }
    const formData = new FormData();
    formData.set("file", selectedFile);
    formData.set("title", title);
    formData.set("altText", altText);
    formData.set("caption", caption);
    formData.set("credit", credit);
    formData.set("tags", "");
    setUploadError(null);
    startTransition(async () => {
      const state = await uploadStoryFeaturedMediaAction(uploadInitialState, formData);
      if (state.status === "success") {
        selectMedia(state.media);
        setUploadOpen(false);
        resetUpload();
      } else {
        setUploadError(state.message ?? "The image could not be uploaded. Try again.");
      }
    });
  }

  return (
    <section aria-labelledby="featured-media-label" className="space-y-3">
      <input name="featuredMediaId" type="hidden" value={selectedId} />
      <div className="space-y-3">
        <div><h3 className="text-sm font-medium" id="featured-media-label">Featured image</h3><p className="mt-1 text-xs text-muted-foreground">Choose one active Media Library image for Story cards and public presentation.</p></div>
        {canManage ? (
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Button className="w-full sm:w-auto" onClick={() => fileInputRef.current?.click()} variant="outline"><Upload aria-hidden="true" />Upload image</Button>
            <input
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)}
              ref={fileInputRef}
              tabIndex={-1}
              type="file"
            />
            <MediaPicker allowedType="image" onCancel={() => undefined} onOpenChange={setPickerOpen} onSelect={selectMedia} open={pickerOpen} selectedMediaId={selectedId || null} title="Choose featured media" trigger={<span>Choose from Media Library</span>} />
          </div>
        ) : null}
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

      <DialogPrimitive.Root open={uploadOpen} onOpenChange={(next) => { if (!next) closeUpload(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            aria-describedby="story-upload-description"
            className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-1.5rem)] w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-2xl focus:outline-none sm:p-6"
            onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
            onInteractOutside={(event) => { if (pending) event.preventDefault(); }}
          >
            <div className="pe-12">
              <DialogPrimitive.Title className="font-heading text-xl font-semibold">Add featured image</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground" id="story-upload-description">Add the editorial details before this image enters Media Library.</DialogPrimitive.Description>
            </div>
            <Button aria-label="Close upload dialog" className="absolute end-3 top-3" disabled={pending} onClick={closeUpload} size="icon" variant="ghost"><X aria-hidden="true" /></Button>

            {selectedFile ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-background"><ImagePlus aria-hidden="true" className="size-5" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{selectedFile.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Upload starts after metadata is complete</p></div>
              </div>
            ) : null}

            <div className="grid gap-4">
              <label className="grid gap-2"><span className="text-sm font-medium">Title *</span><input autoFocus className={control} disabled={pending} maxLength={200} name="title" onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
              <label className="grid gap-2"><span className="text-sm font-medium">Alt text *</span><input className={control} disabled={pending} maxLength={500} name="altText" onChange={(event) => setAltText(event.target.value)} required value={altText} /><span className="text-xs text-muted-foreground">Describe what is visible for readers using assistive technology.</span></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2"><span className="text-sm font-medium">Caption</span><input className={control} disabled={pending} maxLength={1000} name="caption" onChange={(event) => setCaption(event.target.value)} value={caption} /></label>
                <label className="grid gap-2"><span className="text-sm font-medium">Credit</span><input className={control} disabled={pending} maxLength={200} name="credit" onChange={(event) => setCredit(event.target.value)} value={credit} /></label>
              </div>
            </div>

            {uploadError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{uploadError}</p> : null}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button disabled={pending} onClick={closeUpload} variant="ghost">Cancel</Button>
              <Button disabled={pending} onClick={uploadSelectedFile}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Upload aria-hidden="true" />}{pending ? "Uploading…" : "Upload and select"}</Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}
