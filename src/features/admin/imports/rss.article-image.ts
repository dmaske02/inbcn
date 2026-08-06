import { normalizeRssFeedUrl } from "./rss.model.ts";
import type { ParsedRssEntry } from "./rss.parser.ts";

const MAX_ARTICLE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_HEADER_BYTES = 128 * 1024;
const MAX_REDIRECTS = 5;
const ENRICHMENT_CONCURRENCY = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type ExternalImageMetadata = Readonly<{
  url: string;
  width: number | null;
  height: number | null;
  source: "og" | "twitter" | "primary";
}>;

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"),
  );
  return match?.[2] ? decodeHtmlAttribute(match[2].trim()) : null;
}

function absoluteImageUrl(value: string | null, articleUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, articleUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function metaContent(html: string, key: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0];
    const marker = attribute(tag, "property") ?? attribute(tag, "name");
    if (marker?.toLocaleLowerCase("en") === key) {
      return attribute(tag, "content");
    }
  }
  return null;
}

function positiveDimension(value: string | null): number | null {
  const parsed = value === null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function metaImage(html: string, key: "og:image" | "twitter:image", articleUrl: string): ExternalImageMetadata | null {
  const url = absoluteImageUrl(metaContent(html, key), articleUrl);
  if (!url) return null;
  const prefix = key.split(":")[0];
  return {
    url,
    width: positiveDimension(metaContent(html, `${prefix}:image:width`)),
    height: positiveDimension(metaContent(html, `${prefix}:image:height`)),
    source: key === "og:image" ? "og" : "twitter",
  };
}

function primaryArticleImage(html: string): string | null {
  const article = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/iu)?.[0];
  const scoped = article ?? html;
  for (const match of scoped.matchAll(/<img\b[^>]*>/giu)) {
    const tag = match[0];
    const value =
      attribute(tag, "src") ??
      attribute(tag, "data-src") ??
      attribute(tag, "data-lazy-src");
    if (value) return value;
  }
  return null;
}

export function extractArticleImage(html: string, articleUrl: string): ExternalImageMetadata | null {
  const metadataImage = metaImage(html, "og:image", articleUrl) ?? metaImage(html, "twitter:image", articleUrl);
  if (metadataImage) return metadataImage;
  const url = absoluteImageUrl(primaryArticleImage(html), articleUrl);
  return url ? { url, width: null, height: null, source: "primary" } : null;
}

async function readLimitedHtml(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ARTICLE_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ARTICLE_BYTES) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function requestArticleImage(
  articleUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<ExternalImageMetadata | null> {
  let requestUrl: string;
  try {
    requestUrl = normalizeRssFeedUrl(articleUrl);
  } catch {
    return null;
  }
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetcher(requestUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "INBCN-RSS-Importer/1.0",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) return null;
        requestUrl = normalizeRssFeedUrl(new URL(location, requestUrl).toString());
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        return null;
      }
      const html = await readLimitedHtml(response);
      return html ? extractArticleImage(html, requestUrl) : null;
    }
  } catch {}
  return null;
}

function dimensionsFromImageHeader(bytes: Uint8Array): Readonly<{ width: number; height: number }> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 10 && String.fromCharCode(...bytes.subarray(0, 3)) === "GIF") {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === "VP8X") return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
    if (kind === "VP8 " && bytes.length >= 30) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += length + 2;
    }
  }
  return null;
}

async function readLimitedBytes(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < MAX_IMAGE_HEADER_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const accepted = value.subarray(0, MAX_IMAGE_HEADER_BYTES - length);
      chunks.push(accepted);
      length += accepted.byteLength;
      if (accepted.byteLength < value.byteLength) break;
    }
    if (length >= MAX_IMAGE_HEADER_BYTES) await reader.cancel();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function requestImageDimensions(
  imageUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Readonly<{ width: number; height: number }> | null> {
  let requestUrl: string;
  try { requestUrl = normalizeRssFeedUrl(imageUrl); } catch { return null; }
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetcher(requestUrl, {
        headers: { Accept: "image/*", Range: `bytes=0-${MAX_IMAGE_HEADER_BYTES - 1}`, "User-Agent": "INBCN-RSS-Importer/1.0" },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) return null;
        requestUrl = normalizeRssFeedUrl(new URL(location, requestUrl).toString());
        continue;
      }
      if (!response.ok) return null;
      const bytes = await readLimitedBytes(response);
      return bytes ? dimensionsFromImageHeader(bytes) : null;
    }
  } catch {}
  return null;
}

export async function enrichRssEntryImages<T extends Pick<ParsedRssEntry, "link" | "imageUrl" | "imageWidth" | "imageHeight">>(
  entries: readonly T[],
  resolveImage: (articleUrl: string) => Promise<ExternalImageMetadata | null> = requestArticleImage,
  resolveDimensions: (imageUrl: string) => Promise<Readonly<{ width: number; height: number }> | null> = requestImageDimensions,
): Promise<T[]> {
  const enriched = [...entries];
  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      const entry = entries[index];
      const articleImage = entry.link ? await resolveImage(entry.link) : null;
      const feedImage = entry.imageUrl ? { url: entry.imageUrl, width: entry.imageWidth, height: entry.imageHeight } : null;
      const selected = articleImage?.source === "og" || articleImage?.source === "twitter"
        ? articleImage
        : feedImage ?? articleImage;
      if (!selected) continue;
      const dimensions = selected.width && selected.height ? selected : await resolveDimensions(selected.url);
      enriched[index] = {
        ...entry,
        imageUrl: selected.url,
        imageWidth: selected.width ?? dimensions?.width ?? null,
        imageHeight: selected.height ?? dimensions?.height ?? null,
      };
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(ENRICHMENT_CONCURRENCY, entries.length) },
      () => worker(),
    ),
  );
  return enriched;
}
