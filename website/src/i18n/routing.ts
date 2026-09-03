import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "hi", "mr"],
  defaultLocale: "hi",
  localePrefix: "always",
});

export function localeRoutingHeaders(headers: Headers): Headers {
  const localeHeaders = new Headers(headers);
  localeHeaders.delete("accept-language");
  return localeHeaders;
}

export function localizePublicPath(
  pathname: string,
  locale: (typeof routing.locales)[number],
  search = "",
  hash = "",
): string {
  const segments = pathname.split("/");
  segments[1] = locale;
  const localizedPath = segments.join("/") || `/${locale}`;
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const fragment = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${localizedPath}${query}${fragment}`;
}
