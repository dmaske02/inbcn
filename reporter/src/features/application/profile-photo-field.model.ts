export const MAX_PROFILE_PHOTO_SIZE = 10 * 1024 * 1024;

const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfilePhotoSelection = Readonly<{ type: string; size: number }>;

export function validateProfilePhotoSelection(file: ProfilePhotoSelection): string | null {
  if (!PROFILE_PHOTO_TYPES.has(file.type.toLocaleLowerCase("en"))) {
    return "Choose a JPG, PNG, or WebP image.";
  }
  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    return "Portraits must be 10 MiB or smaller.";
  }
  return null;
}

export function formatProfilePhotoSize(bytes: number): string {
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
