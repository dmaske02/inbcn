export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 250 * 1024 * 1024;

export type UploadMediaType = "image" | "video";

export type ValidatedUpload = Readonly<{
  mediaType: UploadMediaType;
  filename: string;
  bytes: number;
  mimeType: string;
  format: "jpg" | "jpeg" | "png" | "webp" | "avif" | "mp4" | "webm";
}>;

export type UploadValidation =
  | Readonly<{ ok: true; data: ValidatedUpload }>
  | Readonly<{ ok: false; reason: "bytes" | "filename" | "media-type" | "mismatch" }>;

const formats = {
  "image/jpeg": { mediaType: "image", extensions: ["jpg", "jpeg"], format: "jpg", maximum: MAX_IMAGE_UPLOAD_BYTES },
  "image/png": { mediaType: "image", extensions: ["png"], format: "png", maximum: MAX_IMAGE_UPLOAD_BYTES },
  "image/webp": { mediaType: "image", extensions: ["webp"], format: "webp", maximum: MAX_IMAGE_UPLOAD_BYTES },
  "image/avif": { mediaType: "image", extensions: ["avif"], format: "avif", maximum: MAX_IMAGE_UPLOAD_BYTES },
  "video/mp4": { mediaType: "video", extensions: ["mp4"], format: "mp4", maximum: MAX_VIDEO_UPLOAD_BYTES },
  "video/webm": { mediaType: "video", extensions: ["webm"], format: "webm", maximum: MAX_VIDEO_UPLOAD_BYTES },
} as const;

const CONTROL_OR_PATH = /[\u0000-\u001f\u007f/\\]/u;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);
const CLOUDINARY_SIGNATURE_VALIDITY_MS = 60 * 60 * 1_000;
// One minute covers boundary clock skew without extending Cloudinary's documented one-hour signing window materially.
const CLOUDINARY_UPLOAD_CLOCK_SKEW_MS = 60 * 1_000;

export function validateUpload(input: Readonly<{
  mediaType: unknown;
  filename: unknown;
  bytes: unknown;
  mimeType: unknown;
}>): UploadValidation {
  if (input.mediaType !== "image" && input.mediaType !== "video") {
    return { ok: false, reason: "media-type" };
  }
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  if (!filename || filename.length > 255 || CONTROL_OR_PATH.test(filename)) {
    return { ok: false, reason: "filename" };
  }
  const extension = filename.includes(".") ? filename.split(".").at(-1)?.toLocaleLowerCase("en") : "";
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.trim().toLocaleLowerCase("en") : "";
  const allowed = formats[mimeType as keyof typeof formats];
  if (!allowed || allowed.mediaType !== input.mediaType || !extension || !allowed.extensions.includes(extension as never)) {
    return { ok: false, reason: "mismatch" };
  }
  if (typeof input.bytes !== "number"
    || !Number.isSafeInteger(input.bytes)
    || input.bytes <= 0
    || input.bytes > allowed.maximum) {
    return { ok: false, reason: "bytes" };
  }
  return {
    ok: true,
    data: {
      mediaType: input.mediaType,
      filename,
      bytes: input.bytes,
      mimeType,
      format: allowed.format,
    },
  };
}

export type UploadMetadata = Readonly<{
  title: string;
  originalFilename: string;
  altText: string | null;
}>;

export function validateUploadMetadata(input: Readonly<{
  mediaType: unknown;
  title: unknown;
  originalFilename: unknown;
  altText: unknown;
}>): Readonly<{ ok: true; data: UploadMetadata }> | Readonly<{ ok: false }> {
  if (input.mediaType !== "image" && input.mediaType !== "video") return { ok: false };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const originalFilename = typeof input.originalFilename === "string" ? input.originalFilename.trim() : "";
  const altText = typeof input.altText === "string" ? input.altText.trim() : "";
  const extension = originalFilename.split(".").at(-1)?.toLocaleLowerCase("en") ?? "";
  const allowedExtensions = input.mediaType === "image" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
  if (!title || title.length > 200 || CONTROL_OR_PATH.test(title)
    || !originalFilename || originalFilename.length > 255 || CONTROL_OR_PATH.test(originalFilename)
    || !allowedExtensions.has(extension)
    || altText.length > 500
    || (input.mediaType === "image" && !altText)) {
    return { ok: false };
  }
  return {
    ok: true,
    data: { title, originalFilename, altText: altText || null },
  };
}

const providerFormats = {
  jpg: { mediaType: "image", mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  jpeg: { mediaType: "image", mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  png: { mediaType: "image", mimeType: "image/png", extensions: ["png"] },
  webp: { mediaType: "image", mimeType: "image/webp", extensions: ["webp"] },
  avif: { mediaType: "image", mimeType: "image/avif", extensions: ["avif"] },
  mp4: { mediaType: "video", mimeType: "video/mp4", extensions: ["mp4"] },
  webm: { mediaType: "video", mimeType: "video/webm", extensions: ["webm"] },
} as const;

export type VerifiedProviderAsset = Readonly<{
  assetId: string;
  publicId: string;
  mediaType: UploadMediaType;
  deliveryType: "upload";
  format: keyof typeof providerFormats;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  secureUrl: string;
  createdAt: string;
}>;

export function isSignedUploadFresh(signedAt: number, now: number): boolean {
  return Number.isSafeInteger(signedAt)
    && Number.isSafeInteger(now)
    && signedAt <= now + 300
    && signedAt > now - 3_600;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function optionalPositiveInteger(value: unknown): number | null | undefined {
  return value === undefined || value === null ? null : positiveInteger(value) ? value : undefined;
}

function expectedSecureUrl(
  value: unknown,
  cloudName: string,
  mediaType: UploadMediaType,
  publicId: string,
  format: string,
): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com"
      || url.username || url.password || url.port || url.search || url.hash) return false;
    const path = decodeURIComponent(url.pathname);
    const extension = format === "jpeg" ? "(?:jpg|jpeg)" : format.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return path.startsWith(`/${cloudName}/${mediaType}/upload/`)
      && new RegExp(`/${publicId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[.]${extension}$`, "u").test(path);
  } catch {
    return false;
  }
}

export function validateProviderAsset(
  value: unknown,
  expected: Readonly<{
    assetId: string;
    publicId: string;
    mediaType: UploadMediaType;
    originalFilename: string;
    cloudName: string;
    signedAt: number;
  }>,
  now: string,
): Readonly<{ ok: true; data: VerifiedProviderAsset }> | Readonly<{ ok: false }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const asset = value as Record<string, unknown>;
  const format = typeof asset.format === "string" ? asset.format.toLocaleLowerCase("en") : "";
  const formatDetails = providerFormats[format as keyof typeof providerFormats];
  const extension = expected.originalFilename.split(".").at(-1)?.toLocaleLowerCase("en") ?? "";
  const width = optionalPositiveInteger(asset.width);
  const height = optionalPositiveInteger(asset.height);
  const duration = typeof asset.duration === "number" && Number.isFinite(asset.duration) && asset.duration > 0
    ? asset.duration
    : undefined;
  const created = typeof asset.created_at === "string" ? Date.parse(asset.created_at) : Number.NaN;
  const current = Date.parse(now);
  const maximum = expected.mediaType === "image" ? MAX_IMAGE_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES;
  if (asset.asset_id !== expected.assetId
    || asset.public_id !== expected.publicId
    || asset.resource_type !== expected.mediaType
    || asset.type !== "upload"
    || ("status" in asset && asset.status !== "active")
    || asset.placeholder === true
    || !formatDetails
    || formatDetails.mediaType !== expected.mediaType
    || !formatDetails.extensions.includes(extension as never)
    || !positiveInteger(asset.bytes)
    || asset.bytes > maximum
    || width === undefined || height === undefined
    || (expected.mediaType === "image" && (width === null || height === null))
    || (expected.mediaType === "video" && duration === undefined)
    || !expectedSecureUrl(asset.secure_url, expected.cloudName, expected.mediaType, expected.publicId, format)
    || !Number.isFinite(created) || !Number.isFinite(current)
    || !Number.isSafeInteger(expected.signedAt)
    || created < expected.signedAt * 1_000 - CLOUDINARY_UPLOAD_CLOCK_SKEW_MS
    || created > expected.signedAt * 1_000 + CLOUDINARY_SIGNATURE_VALIDITY_MS + CLOUDINARY_UPLOAD_CLOCK_SKEW_MS
    || created > current + 5 * 60_000) {
    return { ok: false };
  }
  return {
    ok: true,
    data: {
      assetId: expected.assetId,
      publicId: expected.publicId,
      mediaType: expected.mediaType,
      deliveryType: "upload",
      format: format as keyof typeof providerFormats,
      mimeType: formatDetails.mimeType,
      bytes: asset.bytes,
      width,
      height,
      durationSeconds: expected.mediaType === "video" ? duration ?? null : null,
      secureUrl: asset.secure_url as string,
      createdAt: new Date(created).toISOString(),
    },
  };
}

export const CLOUDINARY_DIRECT_UPLOAD_LIMIT = 100 * 1024 * 1024;
export const CLOUDINARY_UPLOAD_CHUNK_BYTES = 20 * 1024 * 1024;

export type UploadPhase = "idle" | "signing" | "uploading" | "completing" | "error" | "complete";

export function isUploadBusy(phase: UploadPhase): boolean {
  return phase === "signing" || phase === "uploading" || phase === "completing";
}

export type BrowserUploadAuthorization = Readonly<{
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  resourceType: UploadMediaType;
  uploadUrl: string;
  publicId: string;
  signedParameters: Readonly<{
    public_id: string;
    type: "upload";
    overwrite: false;
    allowed_formats: readonly string[];
  }>;
}>;

export class UploadClientError extends Error {
  readonly code: "cancelled" | "failed";

  constructor(code: "cancelled" | "failed") {
    super(code === "cancelled" ? "Upload cancelled." : "The file could not be uploaded. Please try again.");
    this.name = "UploadClientError";
    this.code = code;
  }
}

export function cloudinaryUploadChunks(bytes: number): readonly Readonly<{ start: number; end: number }>[] {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return [];
  if (bytes <= CLOUDINARY_DIRECT_UPLOAD_LIMIT) return [{ start: 0, end: bytes }];
  const chunks = [];
  for (let start = 0; start < bytes; start += CLOUDINARY_UPLOAD_CHUNK_BYTES) {
    chunks.push({ start, end: Math.min(start + CLOUDINARY_UPLOAD_CHUNK_BYTES, bytes) });
  }
  return chunks;
}

type BrowserFile = Readonly<{
  name: string;
  size: number;
  type: string;
  slice(start?: number, end?: number, contentType?: string): Blob;
}>;

type BrowserRequest = {
  upload: { onprogress: ((event: ProgressEvent) => void) | null };
  status: number;
  responseText: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  ontimeout: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: FormData): void;
  abort(): void;
};

function uploadFormData(
  file: BrowserFile,
  chunk: Readonly<{ start: number; end: number }>,
  authorization: BrowserUploadAuthorization,
): FormData {
  const formData = new FormData();
  formData.append("file", file.slice(chunk.start, chunk.end, file.type), file.name);
  formData.append("api_key", authorization.apiKey);
  formData.append("timestamp", String(authorization.timestamp));
  formData.append("signature", authorization.signature);
  for (const [name, value] of Object.entries(authorization.signedParameters)) {
    formData.append(name, Array.isArray(value) ? value.join(",") : String(value));
  }
  return formData;
}

export function createBrowserUpload(
  file: BrowserFile,
  authorization: BrowserUploadAuthorization,
  options: Readonly<{
    createRequest?: () => BrowserRequest;
    uploadId?: () => string;
    onProgress?: (percent: number) => void;
  }> = {},
): Readonly<{ promise: Promise<Readonly<{ assetId: string }>>; cancel(): void }> {
  const chunks = cloudinaryUploadChunks(file.size);
  const createRequest = options.createRequest ?? (() => new XMLHttpRequest() as BrowserRequest);
  const uploadId = options.uploadId ? options.uploadId() : crypto.randomUUID();
  let active: BrowserRequest | null = null;
  let cancelled = false;

  const promise = (async () => {
    if (chunks.length === 0) throw new UploadClientError("failed");
    for (const [index, chunk] of chunks.entries()) {
      if (cancelled) throw new UploadClientError("cancelled");
      const response = await new Promise<unknown>((resolve, reject) => {
        const request = createRequest();
        active = request;
        request.open("POST", authorization.uploadUrl);
        if (chunks.length > 1) {
          request.setRequestHeader("X-Unique-Upload-Id", uploadId);
          request.setRequestHeader("Content-Range", `bytes ${chunk.start}-${chunk.end - 1}/${file.size}`);
        }
        request.upload.onprogress = (event) => {
          if (!event.lengthComputable || event.total <= 0) return;
          const loaded = chunk.start + Math.min(1, event.loaded / event.total) * (chunk.end - chunk.start);
          options.onProgress?.(Math.min(100, Math.round(loaded / file.size * 100)));
        };
        request.onerror = () => reject(new UploadClientError("failed"));
        request.ontimeout = () => reject(new UploadClientError("failed"));
        request.onabort = () => reject(new UploadClientError("cancelled"));
        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new UploadClientError("failed"));
            return;
          }
          try {
            resolve(JSON.parse(request.responseText));
          } catch {
            reject(new UploadClientError("failed"));
          }
        };
        request.send(uploadFormData(file, chunk, authorization));
      });
      active = null;
      const result = response && typeof response === "object" ? response as Record<string, unknown> : {};
      const final = index === chunks.length - 1;
      if (!final && result.done !== false) throw new UploadClientError("failed");
      if (final) {
        if (typeof result.asset_id !== "string" || !result.asset_id) throw new UploadClientError("failed");
        options.onProgress?.(100);
        return { assetId: result.asset_id };
      }
    }
    throw new UploadClientError("failed");
  })().catch((error) => {
    if (error instanceof UploadClientError) throw error;
    throw new UploadClientError(cancelled ? "cancelled" : "failed");
  });

  return {
    promise,
    cancel() {
      cancelled = true;
      active?.abort();
    },
  };
}
