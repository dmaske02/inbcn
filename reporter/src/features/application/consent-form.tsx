"use client";

import { getConsentNotices, type ConsentLocale } from "./consent.model";

const localeLabels = { en: "English", hi: "हिन्दी", mr: "मराठी" } as const;

export function ConsentForm({
  locale,
  onLocaleChange,
}: Readonly<{
  locale: ConsentLocale;
  onLocaleChange(locale: ConsentLocale): void;
}>) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Separate consent notices</legend>
      <label className="block text-sm font-medium" htmlFor="consentLocale">
        Notice language
      </label>
      <select
        className="w-full rounded-md border border-border bg-background px-3 py-2"
        id="consentLocale"
        name="consentLocale"
        value={locale}
        onChange={(event) => onLocaleChange(event.target.value as ConsentLocale)}
      >
        {Object.entries(localeLabels).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      {getConsentNotices(locale).map((notice) => (
        <label className="flex items-start gap-2 text-sm" key={notice.key}>
          <input
            className="mt-1"
            name={`consent:${notice.key}`}
            type="checkbox"
            defaultChecked={notice.accepted}
            required
          />
          <span>{notice.text} <span className="text-muted-foreground">(v{notice.version})</span></span>
        </label>
      ))}
    </fieldset>
  );
}
