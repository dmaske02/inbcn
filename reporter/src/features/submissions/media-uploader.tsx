"use client";

import { useRef, useState } from "react";

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
}: Readonly<{ storyId: string; onUploaded?: (media: Readonly<{ id: string; title: string; type: UploadMediaType }>) => void }>) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [message, setMessage] = useState("Choose a photo or video to upload.");
  const [progress, setProgress] = useState(0);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const pendingCompletion = useRef<PendingCompletion | null>(null);
  const activeTransfer = useRef<ReturnType<typeof createBrowserUpload> | null>(null);
  const mediaType: UploadMediaType | null = file?.type.startsWith("image/")
    ? "image"
    : file?.type.startsWith("video/") ? "video" : null;
  const busy = isUploadBusy(phase);

  async function upload() {
    if (!file || !mediaType || busy) return;
    const validFile = validateUpload({
      mediaType,
      filename: file.name,
      bytes: file.size,
      mimeType: file.type,
    });
    const metadata = validateUploadMetadata({ mediaType, title, originalFilename: file.name, altText });
    if (!validFile.ok || !metadata.ok) {
      setPhase("error");
      setMessage(mediaType === "image"
        ? "Choose an allowed image and provide a title and alt text."
        : "Choose an allowed video and provide a title.");
      return;
    }

    try {
      let pending = pendingCompletion.current;
      if (!pending) {
        setPhase("signing");
        setMessage("Preparing secure upload…");
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
        if (!signed || !isSignedUploadFresh(signed.timestamp, Math.floor(Date.now() / 1_000))) {
          throw new UploadClientError("failed");
        }
        setPhase("uploading");
        setProgress(0);
        setMessage("Uploading… 0%");
        const transfer = createBrowserUpload(file, signed, {
          onProgress(value) {
            setProgress(value);
            setMessage(`Uploading… ${value}%`);
          },
        });
        activeTransfer.current = transfer;
        const uploaded = await transfer.promise;
        activeTransfer.current = null;
        pending = { authorization: signed, assetId: uploaded.assetId, mediaType };
        pendingCompletion.current = pending;
      }

      setPhase("completing");
      setMessage("Confirming uploaded media…");
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
      pendingCompletion.current = null;
      setCompletedId(mediaId);
      setProgress(100);
      setPhase("complete");
      setMessage("Upload complete.");
      onUploaded?.({ id: mediaId, title: metadata.data.title, type: mediaType });
    } catch (error) {
      activeTransfer.current = null;
      setPhase("error");
      setMessage(error instanceof UploadClientError && error.code === "cancelled"
        ? "Upload cancelled. You can retry the selected file."
        : pendingCompletion.current
          ? "The upload is safe. Retry to finish saving it."
          : "The upload failed. Retry the selected file.");
    }
  }

  return (
    <section aria-label="Story media upload">
      <label htmlFor="story-media-file">Photo or video</label>
      <input
        id="story-media-file"
        type="file"
        disabled={busy}
        accept=".jpg,.jpeg,.png,.webp,.avif,.mp4,.webm,image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          pendingCompletion.current = null;
          setCompletedId(null);
          setProgress(0);
          setPhase("idle");
          setMessage("Ready to upload.");
        }}
      />
      <label htmlFor="story-media-title">Media title</label>
      <input
        id="story-media-title"
        value={title}
        maxLength={200}
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="story-media-alt">Alt text {mediaType === "video" ? "(optional)" : ""}</label>
      <textarea
        id="story-media-alt"
        value={altText}
        maxLength={500}
        disabled={busy}
        onChange={(event) => setAltText(event.target.value)}
      />
      <div aria-live="polite" role={phase === "error" ? "alert" : "status"}>
        {message}
        {phase === "uploading" ? <progress max={100} value={progress}>{progress}%</progress> : null}
      </div>
      {completedId && !onUploaded ? <input type="hidden" name="mediaIds" value={completedId} /> : null}
      {phase === "uploading" ? (
        <button type="button" onClick={() => activeTransfer.current?.cancel()}>Cancel upload</button>
      ) : (
        <button type="button" disabled={!file || busy} onClick={() => void upload()}>
          {phase === "error" ? "Retry" : "Upload media"}
        </button>
      )}
    </section>
  );
}
