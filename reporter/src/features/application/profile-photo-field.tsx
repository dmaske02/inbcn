"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/button";
import { formatProfilePhotoSize, validateProfilePhotoSelection } from "./profile-photo-field.model";

type ProfilePhotoFieldProps = Readonly<{ pending?: boolean; errorMessage?: string }>;

function PortraitIcon() {
  return (
    <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
      <path d="M4.75 6.75A1.75 1.75 0 0 1 6.5 5h2l1-1.5h5L15.5 5h2a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 17.5 19h-11a1.75 1.75 0 0 1-1.75-1.75V6.75Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="11.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ProfilePhotoField({ pending = false, errorMessage }: ProfilePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const displayedError = selectionError ?? errorMessage;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function chooseImage() {
    inputRef.current?.click();
  }

  function removeImage() {
    if (inputRef.current) inputRef.current.value = "";
    setSelectedFile(null);
    setPreviewUrl(null);
    setSelectionError(null);
  }

  function handleSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const validationError = validateProfilePhotoSelection(file);
    if (validationError) {
      event.currentTarget.value = "";
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectionError(validationError);
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setSelectionError(null);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Public portrait</legend>
      <div className="space-y-1">
        <p className="text-sm text-foreground">Your profile photo will appear publicly with your journalism.</p>
        <p className="text-xs text-muted-foreground" id="portrait-requirements">JPG, PNG or WebP · Max 10 MB</p>
      </div>

      <input
        ref={inputRef}
        aria-describedby={displayedError ? "portrait-requirements portrait-error" : "portrait-requirements"}
        aria-invalid={Boolean(displayedError)}
        aria-label="Choose a public portrait image"
        className="sr-only"
        id="publicPortrait"
        name="publicPortrait"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleSelection}
        required
      />

      <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center">
        {selectedFile && previewUrl ? (
          <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
            <Image alt={`Preview of ${selectedFile.name}`} className="object-cover" fill sizes="56px" src={previewUrl} unoptimized />
          </div>
        ) : (
          <div className="grid aspect-[4/5] w-14 shrink-0 place-items-center rounded-sm border border-border bg-muted text-muted-foreground">
            <PortraitIcon />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {selectedFile ? (
            <>
              <p className="truncate text-sm font-medium" title={selectedFile.name}>{selectedFile.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatProfilePhotoSize(selectedFile.size)}</p>
              <p className="mt-1 text-xs text-verified">Ready to upload with your application.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Upload your portrait</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose a clear, recent photo where your face is easy to recognize.</p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {selectedFile ? (
            <>
              <Button disabled={pending} onClick={chooseImage} size="sm" variant="outline">Change</Button>
              <Button className="text-destructive hover:text-destructive" disabled={pending} onClick={removeImage} size="sm" variant="ghost">Remove</Button>
            </>
          ) : (
            <Button disabled={pending} onClick={chooseImage} size="sm" variant="outline">Choose image</Button>
          )}
        </div>
      </div>

      <div aria-live="polite" className="min-h-5">
        {pending && selectedFile ? <p className="text-xs text-muted-foreground">Uploading portrait…</p> : null}
        {displayedError ? <p className="text-xs text-destructive" id="portrait-error" role="alert">{displayedError}</p> : null}
      </div>

      <label className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs leading-5 text-foreground">
        <input className="mt-1 shrink-0" name="portraitDeclaration" type="checkbox" required />
        <span>This is a separate public portrait, not an Aadhaar, KYC, or other identity-document image.</span>
      </label>
    </fieldset>
  );
}
