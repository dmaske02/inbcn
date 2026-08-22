export function ProfilePhotoField() {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Public portrait</legend>
      <p className="text-sm text-muted-foreground">
        Upload a JPEG, PNG, or WebP portrait up to 10 MiB. It stays unverified until identity-match and admin approval.
      </p>
      <input
        className="block w-full text-sm"
        id="publicPortrait"
        name="publicPortrait"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
      />
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1" name="portraitDeclaration" type="checkbox" required />
        <span>This is a separate public portrait, not an Aadhaar, KYC, or other identity-document image.</span>
      </label>
    </fieldset>
  );
}
