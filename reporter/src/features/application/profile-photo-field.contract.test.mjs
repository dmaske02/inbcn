import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("portrait field renders a compact accessible upload surface instead of browser file chrome", async () => {
  const field = await read("./profile-photo-field.tsx");

  assert.match(field, /"use client"/u);
  assert.match(field, /Upload your portrait/u);
  assert.match(field, /JPG, PNG or WebP · Max 10 MB/u);
  assert.match(field, /Choose image/u);
  assert.match(field, /type="file"/u);
  assert.match(field, /className="sr-only"/u);
  assert.match(field, /aria-label="Choose a public portrait image"/u);
  assert.match(field, /inputRef\.current\?\.click\(\)/u);
  assert.doesNotMatch(field, /No file chosen/u);
});

test("portrait field previews selected media with change and remove controls", async () => {
  const field = await read("./profile-photo-field.tsx");

  assert.match(field, /URL\.createObjectURL/u);
  assert.match(field, /URL\.revokeObjectURL/u);
  assert.match(field, /alt=\{`Preview of \$\{selectedFile\.name\}`\}/u);
  assert.match(field, /object-cover/u);
  assert.match(field, /selectedFile\.name/u);
  assert.match(field, /formatProfilePhotoSize\(selectedFile\.size\)/u);
  assert.match(field, />Change</u);
  assert.match(field, />Remove</u);
  assert.match(field, /inputRef\.current\.value = ""/u);
});

test("portrait field keeps validation, status, security, and responsive affordances", async () => {
  const [field, form] = await Promise.all([
    read("./profile-photo-field.tsx"),
    read("./application-form.tsx"),
  ]);

  assert.match(field, /accept="image\/jpeg,image\/png,image\/webp"/u);
  assert.match(field, /validateProfilePhotoSelection/u);
  assert.match(field, /aria-live="polite"/u);
  assert.match(field, /Uploading portrait…/u);
  assert.match(field, /This is a separate public portrait, not an Aadhaar, KYC, or other identity-document image\./u);
  assert.match(field, /min-w-0/u);
  assert.match(field, /sm:flex-row/u);
  assert.doesNotMatch(field, /overflow-x-auto/u);
  assert.match(form, /<ProfilePhotoField[\s\S]*pending=\{pending\}/u);
  assert.match(form, /errorMessage=/u);
});
