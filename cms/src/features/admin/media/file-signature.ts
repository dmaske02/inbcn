export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

export type VerifiedImageFormat = "jpeg" | "png" | "webp" | "avif";

type FilenameValidation =
  | Readonly<{ ok: true; filename: string; extension: string }>
  | Readonly<{ ok: false; reason: "UNSAFE_FILENAME" | "UNSUPPORTED_EXTENSION" }>;

export type ImageInspection =
  | Readonly<{
      ok: true;
      format: VerifiedImageFormat;
      mimeType: string;
      extension: string;
      filename: string;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "EMPTY_FILE"
        | "FILE_TOO_LARGE"
        | "SIZE_MISMATCH"
        | "UNSAFE_FILENAME"
        | "UNSUPPORTED_EXTENSION"
        | "UNSUPPORTED_FORMAT"
        | "MALFORMED_IMAGE"
        | "MIME_MISMATCH"
        | "EXTENSION_MISMATCH";
    }>;

const FORMAT_RULES = {
  jpeg: { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  png: { mimeType: "image/png", extensions: ["png"] },
  webp: { mimeType: "image/webp", extensions: ["webp"] },
  avif: { mimeType: "image/avif", extensions: ["avif"] },
} as const satisfies Record<VerifiedImageFormat, Readonly<{ mimeType: string; extensions: readonly string[] }>>;

const ALL_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(FORMAT_RULES).flatMap(({ extensions }) => extensions),
);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3];
}

function uint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + ((bytes[offset + 3] << 24) >>> 0);
}

function detectFormat(bytes: Uint8Array): VerifiedImageFormat | "malformed" | "unsupported" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return bytes.length >= 4 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
      ? "jpeg"
      : "malformed";
  }

  const pngPrefix = bytes.length >= 4 && ascii(bytes, 0, 4) === "\x89PNG";
  if (pngPrefix) {
    const signature = bytes.length >= 8
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const ihdr = bytes.length >= 33 && uint32BigEndian(bytes, 8) === 13 && ascii(bytes, 12, 4) === "IHDR";
    const iend = bytes.length >= 45 && ascii(bytes, bytes.length - 8, 4) === "IEND";
    return signature && ihdr && iend ? "png" : "malformed";
  }

  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "RIFF") {
    const declaredLength = bytes.length >= 8 ? uint32LittleEndian(bytes, 4) + 8 : 0;
    const chunk = bytes.length >= 16 ? ascii(bytes, 12, 4) : "";
    const supportedChunk = chunk === "VP8 " || chunk === "VP8L" || chunk === "VP8X";
    return bytes.length >= 20 && ascii(bytes, 8, 4) === "WEBP"
      && declaredLength === bytes.length && supportedChunk
      ? "webp"
      : "malformed";
  }

  if (bytes.length >= 8 && ascii(bytes, 4, 4) === "ftyp") {
    const boxSize = uint32BigEndian(bytes, 0);
    if (boxSize < 16 || boxSize > bytes.length || boxSize % 4 !== 0) return "malformed";
    const brands = [];
    for (let offset = 8; offset + 4 <= boxSize; offset += 4) brands.push(ascii(bytes, offset, 4));
    return brands.includes("avif") || brands.includes("avis") ? "avif" : "unsupported";
  }

  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "GIF") return "unsupported";
  return "unsupported";
}

export function sanitizeImageFilename(name: string): FilenameValidation {
  const filename = name.trim().normalize("NFKC");
  if (
    !filename
    || filename.length > 255
    || CONTROL_CHARACTERS.test(filename)
    || BIDI_CONTROLS.test(filename)
    || /[\\/]/u.test(filename)
    || /^[a-zA-Z]:/u.test(filename)
    || filename.includes("..")
  ) {
    return { ok: false, reason: "UNSAFE_FILENAME" };
  }

  const separator = filename.lastIndexOf(".");
  const extension = separator > 0 ? filename.slice(separator + 1).toLocaleLowerCase("en") : "";
  if (!ALL_EXTENSIONS.has(extension)) return { ok: false, reason: "UNSUPPORTED_EXTENSION" };
  return { ok: true, filename, extension };
}

export function inspectImageFile(file: Readonly<{
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}>): ImageInspection {
  if (file.bytes.length === 0) return { ok: false, reason: "EMPTY_FILE" };
  if (file.bytes.length > MAX_IMAGE_FILE_SIZE) return { ok: false, reason: "FILE_TOO_LARGE" };
  if (file.size !== file.bytes.length) return { ok: false, reason: "SIZE_MISMATCH" };

  const filename = sanitizeImageFilename(file.name);
  if (!filename.ok) return filename;

  const detected = detectFormat(file.bytes);
  if (detected === "malformed") return { ok: false, reason: "MALFORMED_IMAGE" };
  if (detected === "unsupported") return { ok: false, reason: "UNSUPPORTED_FORMAT" };

  const rule = FORMAT_RULES[detected];
  if (file.type.trim().toLocaleLowerCase("en") !== rule.mimeType) {
    return { ok: false, reason: "MIME_MISMATCH" };
  }
  if (!(rule.extensions as readonly string[]).includes(filename.extension)) {
    return { ok: false, reason: "EXTENSION_MISMATCH" };
  }

  return {
    ok: true,
    format: detected,
    mimeType: rule.mimeType,
    extension: filename.extension,
    filename: filename.filename,
  };
}

export function createCloudinaryObjectIdentifier(now: Date, id: string): string {
  const year = now.getUTCFullYear().toString().padStart(4, "0");
  const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  return `inbcn/media/image/${year}/${month}/${id}`;
}
