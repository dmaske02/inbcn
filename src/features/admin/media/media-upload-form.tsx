"use client";

import { useActionState } from "react";
import { ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  replaceMediaAction,
  uploadMediaAction,
  type MediaActionState,
} from "./media.actions";

const initialState: MediaActionState = { status: "idle" };
const control =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

type MediaUploadFormProps = Readonly<{
  mediaId?: string;
  initial?: Readonly<{
    title: string;
    altText: string;
    caption: string | null;
    credit: string | null;
    tags: readonly string[];
  }>;
  compact?: boolean;
}>;

export function MediaUploadForm({
  mediaId,
  initial,
  compact = false,
}: MediaUploadFormProps) {
  const action = mediaId
    ? replaceMediaAction.bind(null, mediaId)
    : uploadMediaAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitLabel = mediaId ? "Replace image" : "Upload image";

  return (
    <form action={formAction} className="grid gap-4" encType="multipart/form-data">
      <label className="grid gap-2">
        <span className="text-sm font-medium">Image file *</span>
        <input
          accept="image/jpeg,image/png,image/webp,image/avif"
          className={`${control} cursor-pointer py-2 file:me-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium`}
          name="file"
          required
          type="file"
        />
        <span className="text-xs text-muted-foreground">
          JPEG, PNG, WebP, or AVIF. Maximum 10 MB.
        </span>
      </label>
      <div className={compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Title *</span>
          <input className={control} defaultValue={initial?.title} maxLength={200} name="title" required />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Alt text *</span>
          <input className={control} defaultValue={initial?.altText} maxLength={500} name="altText" required />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Caption</span>
          <input className={control} defaultValue={initial?.caption ?? ""} maxLength={1000} name="caption" />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Credit</span>
          <input className={control} defaultValue={initial?.credit ?? ""} maxLength={200} name="credit" />
        </label>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Tags</span>
        <input
          className={control}
          defaultValue={initial?.tags.join(", ")}
          maxLength={1000}
          name="tags"
          placeholder="politics, parliament, national"
        />
      </label>
      {state.message ? (
        <p
          className={state.status === "error"
            ? "text-sm text-destructive"
            : "text-sm text-verified"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      {pending ? (
        <div aria-live="polite" className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          <span className="sr-only">Uploading image</span>
        </div>
      ) : null}
      <Button disabled={pending} type="submit" variant={mediaId ? "outline" : "default"}>
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : mediaId ? (
          <RefreshCw aria-hidden="true" />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
        {pending ? "Uploading…" : submitLabel}
      </Button>
    </form>
  );
}
