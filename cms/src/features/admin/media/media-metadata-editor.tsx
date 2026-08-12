"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { updateMediaMetadataAction, type MediaMetadataActionState } from "./media.actions";
import type { MediaLibraryItemView } from "./media.service";

const initialState: MediaMetadataActionState = { status: "idle" };
const control = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";

export function MediaMetadataEditor({ item, onDirtyChange }: Readonly<{ item: MediaLibraryItemView; onDirtyChange: (dirty: boolean) => void }>) {
  const action = updateMediaMetadataAction.bind(null, item.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const effectiveDirty = dirty && state.status !== "success";
  const current = state.media ?? {
    title: item.title, originalFilename: item.originalFilename, altText: item.altText,
    caption: item.caption ?? "", credit: item.credit ?? "", updatedAt: item.updatedAt,
  };
  const formKey = useMemo(() => current.updatedAt, [current.updatedAt]);

  useEffect(() => { onDirtyChange(effectiveDirty); }, [effectiveDirty, onDirtyChange]);
  useEffect(() => {
    const beforeunload = (event: BeforeUnloadEvent) => { if (effectiveDirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeunload);
    return () => window.removeEventListener("beforeunload", beforeunload);
  }, [effectiveDirty]);

  if (!editing) return <div><Button onClick={() => setEditing(true)} variant="outline"><Pencil aria-hidden="true" />Edit metadata</Button><p aria-live="polite" className="mt-2 text-sm text-verified">{state.status === "success" ? "Saved. Metadata is up to date." : ""}</p></div>;

  const field = (name: string) => state.fieldErrors?.[name];
  return (
    <form action={formAction} className="grid gap-4" key={formKey} onChange={() => setDirty(true)}>
      <input name="expectedUpdatedAt" type="hidden" value={current.updatedAt} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2"><span className="text-sm font-medium">Title *</span><input aria-describedby={field("title") ? "media-title-error" : undefined} aria-invalid={Boolean(field("title"))} className={control} defaultValue={current.title} maxLength={200} name="title" required />{field("title") ? <span className="text-sm text-destructive" id="media-title-error">{field("title")}</span> : null}</label>
        <label className="grid min-w-0 gap-2"><span className="text-sm font-medium">Original filename</span><input aria-invalid={Boolean(field("originalFilename"))} className={control} defaultValue={current.originalFilename} maxLength={255} name="originalFilename" />{field("originalFilename") ? <span className="text-sm text-destructive">{field("originalFilename")}</span> : <span className="text-xs text-muted-foreground">Display metadata only; this does not rename the stored asset.</span>}</label>
      </div>
      <label className="grid gap-2"><span className="text-sm font-medium">Alt text</span><input aria-invalid={Boolean(field("altText"))} className={control} defaultValue={current.altText} maxLength={500} name="altText" /><span className="text-xs text-muted-foreground">Describe the image for users who cannot see it. Leave empty only for decorative media.</span>{field("altText") ? <span className="text-sm text-destructive">{field("altText")}</span> : null}</label>
      <label className="grid gap-2"><span className="text-sm font-medium">Caption</span><textarea aria-invalid={Boolean(field("caption"))} className={`${control} min-h-24 py-3`} defaultValue={current.caption} maxLength={1000} name="caption" />{field("caption") ? <span className="text-sm text-destructive">{field("caption")}</span> : null}</label>
      <label className="grid gap-2"><span className="text-sm font-medium">Credit</span><input aria-invalid={Boolean(field("credit"))} className={control} defaultValue={current.credit} maxLength={200} name="credit" />{field("credit") ? <span className="text-sm text-destructive">{field("credit")}</span> : null}</label>
      <p aria-live="polite" className={state.status === "success" ? "text-sm text-verified" : "text-sm text-destructive"}>{pending ? "Saving metadata…" : state.message ?? (effectiveDirty ? "Unsaved changes." : "")}</p>
      <div className="flex flex-wrap justify-end gap-2"><Button onClick={() => { if (!effectiveDirty || window.confirm("Discard unsaved changes?")) { setDirty(false); setEditing(false); } }} type="button" variant="ghost">Cancel</Button><Button disabled={pending || !effectiveDirty} type="submit">{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{pending ? "Saving…" : "Save metadata"}</Button></div>
    </form>
  );
}
