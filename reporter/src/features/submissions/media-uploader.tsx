"use client";

import { useEffect, useRef, useState } from "react";

import {
  type BrowserUploadAuthorization,
  type UploadMediaType,
  type UploadPhase,
  UploadClientError,
  createBrowserUpload,
  isUploadBusy,
  isSignedUploadFresh,
  validateUpload,
  validateUploadMetadata,
} from "../uploads/upload.model";

type PendingCompletion = Readonly<{
  authorization: BrowserUploadAuthorization;
  assetId: string;
  mediaType: UploadMediaType;
}>;

type QueuedUpload = Readonly<{
  id: string;
  file: File;
  mediaType: UploadMediaType | null;
  title: string;
  altText: string;
  phase: UploadPhase;
  message: string;
  progress: number;
  completedId: string | null;
  pendingCompletion: PendingCompletion | null;
}>;

function authorization(value: unknown, mediaType: UploadMediaType): BrowserUploadAuthorization | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const fixed = result.signedParameters;
  if (!fixed || typeof fixed !== "object" || Array.isArray(fixed)) return null;
  const parameters = fixed as Record<string, unknown>;
  if (typeof result.cloudName !== "string" || typeof result.apiKey !== "string"
    || typeof result.timestamp !== "number" || !Number.isSafeInteger(result.timestamp)
    || typeof result.signature !== "string" || !/^(?:[\da-f]{40}|[\da-f]{64})$/u.test(result.signature)
    || result.resourceType !== mediaType
    || typeof result.uploadUrl !== "string"
    || result.uploadUrl !== `https://api.cloudinary.com/v1_1/${encodeURIComponent(result.cloudName)}/${mediaType}/upload`
    || typeof result.publicId !== "string"
    || parameters.public_id !== result.publicId
    || parameters.type !== "upload"
    || parameters.overwrite !== false
    || !Array.isArray(parameters.allowed_formats)
    || !parameters.allowed_formats.every((format) => typeof format === "string")) return null;
  return result as unknown as BrowserUploadAuthorization;
}

export function MediaUploader({
  storyId,
  onUploaded,
  onPendingChange,
}: Readonly<{
  storyId: string;
  onUploaded?: (media: Readonly<{ id: string; title: string; type: UploadMediaType }>) => void;
  onPendingChange?: (pending: boolean) => void;
}>) {
  const [uploads, setUploads] = useState<readonly QueuedUpload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadsRef = useRef<readonly QueuedUpload[]>([]);
  const activeTransfers = useRef(new Map<string, ReturnType<typeof createBrowserUpload>>());
  const runningUploads = useRef(new Set<string>());
  const batchRunning = useRef(false);
  const busy = uploads.some((upload) => isUploadBusy(upload.phase));
  const hasIncompleteUploads = uploads.some((upload) => upload.phase !== "complete");

  useEffect(() => {
    onPendingChange?.(hasIncompleteUploads);
  }, [hasIncompleteUploads, onPendingChange]);

  function replaceUploads(update: (current: readonly QueuedUpload[]) => readonly QueuedUpload[]) {
    setUploads((current) => {
      const next = update(current);
      uploadsRef.current = next;
      return next;
    });
  }

  function updateUpload(uploadId: string, update: Partial<QueuedUpload>) {
    replaceUploads((current) => current.map((upload) => upload.id === uploadId ? { ...upload, ...update } : upload));
  }

  function removeUpload(uploadId: string) {
    if (runningUploads.current.has(uploadId)) return;
    replaceUploads((current) => current.filter((upload) => upload.id !== uploadId));
  }

  async function uploadOne(uploadId: string) {
    const upload = uploadsRef.current.find((item) => item.id === uploadId);
    if (!upload || !upload.mediaType || upload.phase === "complete"
      || isUploadBusy(upload.phase) || runningUploads.current.has(uploadId)) return;
    const { file, mediaType } = upload;
    const validFile = validateUpload({
      mediaType,
      filename: file.name,
      bytes: file.size,
      mimeType: file.type,
    });
    const metadata = validateUploadMetadata({
      mediaType,
      title: upload.title,
      originalFilename: file.name,
      altText: upload.altText,
    });
    if (!validFile.ok || !metadata.ok) {
      updateUpload(uploadId, {
        phase: "error",
        message: mediaType === "image"
        ? "Choose an allowed image and provide a title and alt text."
        : "Choose an allowed video and provide a title.",
      });
      return;
    }

    runningUploads.current.add(uploadId);
    let pending = upload.pendingCompletion;
    try {
      if (!pending) {
        updateUpload(uploadId, { phase: "signing", message: "Preparing secure upload…", progress: 0 });
        const signResponse = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storyId,
            mediaType,
            filename: file.name,
            bytes: file.size,
            mimeType: file.type,
          }),
        });
        const signed = authorization(signResponse.ok ? await signResponse.json() : null, mediaType);
        // This handler runs only after an explicit upload action; freshness must use the action-time clock.
        // eslint-disable-next-line react-hooks/purity
        if (!signed || !isSignedUploadFresh(signed.timestamp, Math.floor(Date.now() / 1_000))) {
          throw new UploadClientError("failed");
        }
        updateUpload(uploadId, { phase: "uploading", message: "Uploading… 0%", progress: 0 });
        const transfer = createBrowserUpload(file, signed, {
          onProgress(value) {
            updateUpload(uploadId, { progress: value, message: `Uploading… ${value}%` });
          },
        });
        activeTransfers.current.set(uploadId, transfer);
        const uploaded = await transfer.promise;
        activeTransfers.current.delete(uploadId);
        pending = { authorization: signed, assetId: uploaded.assetId, mediaType };
        updateUpload(uploadId, { pendingCompletion: pending });
      }

      updateUpload(uploadId, { phase: "completing", message: "Confirming uploaded media…" });
      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyId,
          assetId: pending.assetId,
          publicId: pending.authorization.publicId,
          mediaType: pending.mediaType,
          timestamp: pending.authorization.timestamp,
          signature: pending.authorization.signature,
          title: metadata.data.title,
          originalFilename: metadata.data.originalFilename,
          altText: metadata.data.altText,
        }),
      });
      const completed = completeResponse.ok ? await completeResponse.json() as unknown : null;
      const mediaId = completed && typeof completed === "object" && "id" in completed
        && typeof completed.id === "string" ? completed.id : null;
      if (!mediaId) throw new UploadClientError("failed");
      updateUpload(uploadId, {
        completedId: mediaId,
        pendingCompletion: null,
        progress: 100,
        phase: "complete",
        message: "Upload complete.",
      });
      onUploaded?.({ id: mediaId, title: metadata.data.title, type: upload.mediaType });
    } catch (error) {
      activeTransfers.current.delete(uploadId);
      updateUpload(uploadId, {
        pendingCompletion: pending,
        phase: "error",
        message: error instanceof UploadClientError && error.code === "cancelled"
        ? "Upload cancelled. You can retry the selected file."
        : pending
          ? "The upload is safe. Retry to finish saving it."
          : "The upload failed. Retry the selected file.",
      });
    } finally {
      runningUploads.current.delete(uploadId);
    }
  }

  async function uploadPending() {
    if (batchRunning.current) return;
    batchRunning.current = true;
    try {
      const pendingUploads = uploadsRef.current
        .filter((upload) => upload.phase === "idle")
        .map((upload) => upload.id);
      for (const uploadId of pendingUploads) await uploadOne(uploadId);
    } finally { batchRunning.current = false; }
  }

  return (
    <section aria-label="Story media uploads" className="space-y-3">
      <label htmlFor="story-media-file">Photos or videos</label>
      <input
        id="story-media-file"
        ref={fileInput}
        type="file"
        multiple
        disabled={busy}
        accept=".jpg,.jpeg,.png,.webp,.avif,.mp4,.webm,image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files ?? []);
          if (!selectedFiles.length) return;
          const queued = selectedFiles.map((file): QueuedUpload => ({
            id: crypto.randomUUID(),
            file,
            mediaType: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null,
            title: file.name.replace(/\.[^.]+$/u, "").slice(0, 200),
            altText: "",
            phase: "idle",
            message: "Pending upload.",
            progress: 0,
            completedId: null,
            pendingCompletion: null,
          }));
          replaceUploads((current) => [...current, ...queued]);
          event.target.value = "";
        }}
      />
      {uploads.length ? <ul className="space-y-3">{uploads.map((upload) => <li className="space-y-2 rounded-md border border-border p-3" key={upload.id}>
        <p className="break-all text-sm font-medium">{upload.file.name}</p>
        <label className="block text-sm" htmlFor={`story-media-title-${upload.id}`}>Media title<input id={`story-media-title-${upload.id}`} value={upload.title} maxLength={200} disabled={busy || upload.phase === "complete"} onChange={(event) => updateUpload(upload.id, { title: event.target.value })} /></label>
        <label className="block text-sm" htmlFor={`story-media-alt-${upload.id}`}>Alt text {upload.mediaType === "video" ? "(optional)" : ""}<textarea id={`story-media-alt-${upload.id}`} value={upload.altText} maxLength={500} disabled={busy || upload.phase === "complete"} onChange={(event) => updateUpload(upload.id, { altText: event.target.value })} /></label>
        <div aria-live="polite" role={upload.phase === "error" ? "alert" : "status"}>{upload.message}{upload.phase === "uploading" ? <progress max={100} value={upload.progress}>{upload.progress}%</progress> : null}</div>
        {upload.completedId && !onUploaded ? <input type="hidden" name="mediaIds" value={upload.completedId} /> : null}
        {upload.phase === "uploading" ? <button type="button" onClick={() => activeTransfers.current.get(upload.id)?.cancel()}>Cancel upload</button> : null}
        {upload.phase === "error" ? <button type="button" disabled={busy} onClick={() => void uploadOne(upload.id)}>Retry</button> : null}
        {upload.phase !== "complete" && !isUploadBusy(upload.phase) ? <button type="button" disabled={busy} onClick={() => removeUpload(upload.id)}>Remove selected file</button> : null}
      </li>)}</ul> : <p>Choose one or more photos or videos to upload.</p>}
      <button type="button" disabled={busy || !uploads.some((upload) => upload.phase === "idle")} onClick={() => void uploadPending()}>Upload media</button>
    </section>
  );
}
