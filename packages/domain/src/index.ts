export const publicLocales = ["en", "hi", "mr"] as const;
export type PublicLocale = (typeof publicLocales)[number];

export const websiteRevalidationEvents = ["all", "stories", "alerts", "media", "live-tv", "homepage"] as const;
export type WebsiteRevalidationEvent = (typeof websiteRevalidationEvents)[number];
