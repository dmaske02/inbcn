import assert from "node:assert/strict";
import test from "node:test";

import {
  createCloudinaryObjectIdentifier,
  inspectImageFile,
  sanitizeImageFilename,
} from "./file-signature.ts";
import { readFile } from "node:fs/promises";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
  0, 0, 0, 0,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 12, 0, 0, 0,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0, 0, 0, 0,
]);
const avif = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
  0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
  0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31,
]);

function inspect(name, type, bytes, size = bytes.length) {
  return inspectImageFile({ name, type, size, bytes });
}

test("detects supported image formats from actual bytes", () => {
  assert.deepEqual(inspect("photo.jpg", "image/jpeg", jpeg), {
    ok: true, format: "jpeg", mimeType: "image/jpeg", extension: "jpg", filename: "photo.jpg",
  });
  assert.equal(inspect("photo.png", "image/png", png).format, "png");
  assert.equal(inspect("photo.webp", "image/webp", webp).format, "webp");
  assert.equal(inspect("photo.avif", "image/avif", avif).format, "avif");
});

test("rejects GIF because the existing application does not support it", () => {
  const gif = new TextEncoder().encode("GIF89a........");
  assert.deepEqual(inspect("photo.jpg", "image/gif", gif), { ok: false, reason: "UNSUPPORTED_FORMAT" });
});

test("enforces actual byte size including the ten MiB boundary", () => {
  assert.deepEqual(inspect("photo.jpg", "image/jpeg", new Uint8Array()), { ok: false, reason: "EMPTY_FILE" });
  const exact = new Uint8Array(10 * 1024 * 1024);
  exact.set(jpeg.subarray(0, 6));
  exact.set(jpeg.subarray(6), exact.length - 2);
  assert.equal(inspect("photo.jpg", "image/jpeg", exact).ok, true);
  assert.deepEqual(inspect("photo.jpg", "image/jpeg", new Uint8Array(10 * 1024 * 1024 + 1)), { ok: false, reason: "FILE_TOO_LARGE" });
});

test("allows multipart overhead through the Next.js proxy without weakening the file limit", async () => {
  const source = await readFile(new URL("../../../../next.config.ts", import.meta.url), "utf8");

  assert.match(source, /proxyClientMaxBodySize:\s*"11mb"/u);
  assert.match(source, /serverActions:\s*\{[\s\S]*bodySizeLimit:\s*"11mb"/u);
  assert.doesNotMatch(source, /middlewareClientMaxBodySize/u);
});

test("does not trust declared size when it differs from actual bytes", () => {
  assert.deepEqual(inspect("photo.jpg", "image/jpeg", jpeg, jpeg.length + 1), { ok: false, reason: "SIZE_MISMATCH" });
});

test("rejects MIME and extension spoofing against detected bytes", () => {
  assert.deepEqual(inspect("photo.jpg", "image/png", jpeg), { ok: false, reason: "MIME_MISMATCH" });
  assert.deepEqual(inspect("photo.png", "image/jpeg", png), { ok: false, reason: "MIME_MISMATCH" });
  assert.deepEqual(inspect("photo.png", "image/jpeg", jpeg), { ok: false, reason: "EXTENSION_MISMATCH" });
  assert.deepEqual(inspect("photo.exe", "image/jpeg", jpeg), { ok: false, reason: "UNSUPPORTED_EXTENSION" });
  assert.equal(inspect("photo.jpeg", "image/jpeg", jpeg).ok, true);
});

test("rejects malformed and truncated image containers", () => {
  assert.deepEqual(inspect("photo.jpg", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])), { ok: false, reason: "MALFORMED_IMAGE" });
  assert.deepEqual(inspect("photo.png", "image/png", png.subarray(0, 20)), { ok: false, reason: "MALFORMED_IMAGE" });
  assert.deepEqual(inspect("photo.webp", "image/webp", webp.subarray(0, 15)), { ok: false, reason: "MALFORMED_IMAGE" });
  assert.deepEqual(inspect("photo.avif", "image/avif", avif.subarray(0, 12)), { ok: false, reason: "MALFORMED_IMAGE" });
  assert.deepEqual(inspect("photo.jpg", "image/jpeg", new Uint8Array([1, 2, 3, 4, 5])), { ok: false, reason: "UNSUPPORTED_FORMAT" });
});

test("sanitizes a safe filename and rejects traversal or ambiguous names", () => {
  assert.deepEqual(sanitizeImageFilename("  newsroom photo.JPG  "), { ok: true, filename: "newsroom photo.JPG", extension: "jpg" });
  for (const name of [
    "../photo.jpg", "..\\photo.jpg", "folder/photo.jpg", "folder\\photo.jpg",
    "C:\\photo.jpg", "/photo.jpg", "photo\0.jpg", "photo\u0007.jpg",
    "photo\u202e.jpg", "photo\u2066.jpg", "．．/photo.jpg",
  ]) {
    assert.deepEqual(sanitizeImageFilename(name), { ok: false, reason: "UNSAFE_FILENAME" }, name);
  }
});

test("generates a provider identifier without using the client filename", () => {
  const identifier = createCloudinaryObjectIdentifier(
    new Date("2026-08-12T09:30:00.000Z"),
    "123e4567-e89b-12d3-a456-426614174000",
  );
  assert.equal(identifier, "inbcn/media/image/2026/08/123e4567-e89b-12d3-a456-426614174000");
  assert.doesNotMatch(identifier, /news|\.jpg/u);
});

test("Cloudinary upload parameters are server-controlled", async () => {
  const source = await readFile(new URL("./cloudinary.server.ts", import.meta.url), "utf8");
  assert.match(source, /const publicId = createCloudinaryObjectIdentifier\(new Date\(\), randomUUID\(\)\)/u);
  assert.match(source, /public_id: publicId/u);
  assert.match(source, /resource_type: "image"/u);
  assert.match(source, /allowed_formats: \["jpg", "jpeg", "png", "webp", "avif"\]/u);
  assert.doesNotMatch(source, /filename_override|use_filename/u);
});

test("upload actions authenticate before delegating and sanitize unknown errors", async () => {
  const source = await readFile(new URL("./media.actions.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("./media.service.ts", import.meta.url), "utf8");
  assert.match(source, /const admin = await requireAdminUser\(\);[\s\S]*await uploadMedia\(admin, input\)/u);
  assert.match(service, /async function prepareUpload[\s\S]*requireMediaManager\(admin\);[\s\S]*input\.file\.arrayBuffer\(\)/u);
  assert.match(source, /message: "The media operation could not be completed\. Please try again\."/u);
  assert.doesNotMatch(source, /apiSecret|api_secret|CLOUDINARY_API_SECRET/u);
});

test("successful upload revalidates only the Media Library", async () => {
  const source = await readFile(new URL("./media.actions.ts", import.meta.url), "utf8");
  const action = source.match(/export async function uploadMediaAction[\s\S]*?\n\}/u)?.[0] ?? "";
  assert.match(action, /revalidatePath\("\/admin\/media"\)/u);
  assert.doesNotMatch(action, /refreshMediaViews|\/admin\/stories|"\/en"|"\/hi"|"\/mr"/u);
});
