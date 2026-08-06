import { normalizeRssFeedUrl } from "./rss.model.ts";
import {
  parseSyndicationFeed,
  type ParsedSyndicationFeed,
} from "./rss.parser.ts";
import {
  enrichRssEntryImages,
  requestArticleImage,
  requestImageDimensions,
} from "./rss.article-image.ts";

const MAX_RSS_BYTES = 5 * 1024 * 1024;
const MAX_RSS_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function responseContentType(response: Response): string | null {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en") || null;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

export class RssRepositoryError extends Error {
  readonly code:
    | "INVALID_URL"
    | "UNAVAILABLE"
    | "TOO_LARGE"
    | "INVALID_FEED";

  constructor(
    code:
      | "INVALID_URL"
      | "UNAVAILABLE"
      | "TOO_LARGE"
      | "INVALID_FEED",
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "RssRepositoryError";
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RSS_BYTES) {
    throw new RssRepositoryError("TOO_LARGE", "The RSS feed is too large.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RSS_BYTES) {
        await reader.cancel();
        throw new RssRepositoryError("TOO_LARGE", "The RSS feed is too large.");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

export async function requestRssFeed(
  feedUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<ParsedSyndicationFeed> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeRssFeedUrl(feedUrl);
  } catch {
    throw new RssRepositoryError("INVALID_URL", "The RSS feed URL is invalid.");
  }

  let response: Response | null = null;
  let requestUrl = normalizedUrl;
  try {
    for (let redirectCount = 0; redirectCount <= MAX_RSS_REDIRECTS; redirectCount += 1) {
      response = await fetcher(requestUrl, {
        method: "GET",
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
          "User-Agent": "INBCN-RSS-Importer/1.0",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (!REDIRECT_STATUSES.has(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_RSS_REDIRECTS) {
        throw new RssRepositoryError(
          "UNAVAILABLE",
          "The RSS feed redirected too many times.",
        );
      }
      try {
        requestUrl = normalizeRssFeedUrl(new URL(location, requestUrl).toString());
      } catch {
        throw new RssRepositoryError(
          "INVALID_URL",
          "The RSS feed redirected to an invalid URL.",
        );
      }
    }
  } catch (error) {
    if (error instanceof RssRepositoryError) throw error;
    if (isTimeoutError(error)) {
      throw new RssRepositoryError(
        "UNAVAILABLE",
        "Feed request timed out after 15 seconds.",
      );
    }
    throw new RssRepositoryError("UNAVAILABLE", "The RSS feed could not be reached.");
  }
  if (!response) {
    throw new RssRepositoryError("UNAVAILABLE", "The RSS feed could not be reached.");
  }
  if (!response.ok) {
    const contentType = responseContentType(response);
    throw new RssRepositoryError(
      "UNAVAILABLE",
      `Feed returned HTTP ${response.status}${contentType ? ` (${contentType})` : ""}.`,
    );
  }

  const body = await readLimitedBody(response);
  const contentType = responseContentType(response);
  if (contentType === "text/html" || /^\s*(?:<!doctype\s+html|<html\b)/iu.test(body)) {
    throw new RssRepositoryError(
      "INVALID_FEED",
      "Feed returned HTML instead of RSS.",
    );
  }
  let parsedFeed: ParsedSyndicationFeed;
  try {
    parsedFeed = parseSyndicationFeed(body);
  } catch {
    throw new RssRepositoryError(
      "INVALID_FEED",
      "Invalid RSS: response could not be parsed.",
    );
  }
  return {
    ...parsedFeed,
    entries: await enrichRssEntryImages(parsedFeed.entries, (articleUrl) =>
      requestArticleImage(articleUrl, fetcher),
      (imageUrl) => requestImageDimensions(imageUrl, fetcher),
    ),
  };
}
