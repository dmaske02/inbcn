import "server-only";

import { env } from "@/config/env";
import {
  buildNewsDataRequestUrl,
  parseNewsDataResponse,
  sanitizeNewsDataError,
  type NewsDataRequestQuery,
} from "./newsdata.request";

export type NewsDataQuota = Readonly<{
  apiCreditsRemaining: number | null;
  windowLimit: number | null;
  windowRemaining: number | null;
  windowResetAt: string | null;
}>;

export type NewsDataPage = Readonly<{
  totalResults: number;
  articles: readonly unknown[];
  nextPage: string | null;
  quota: NewsDataQuota;
}>;

export class NewsDataRepositoryError extends Error {
  constructor(
    readonly code:
      | "MISSING_CONFIGURATION"
      | "UNAUTHORIZED"
      | "RATE_LIMITED"
      | "INVALID_RESPONSE"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "NewsDataRepositoryError";
  }
}

function numericHeader(headers: Headers, ...names: string[]): number | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value && /^\d+$/u.test(value)) return Number(value);
  }
  return null;
}

function quotaFrom(headers: Headers): NewsDataQuota {
  const reset = numericHeader(headers, "x-ratelimit-reset");
  return {
    apiCreditsRemaining: numericHeader(
      headers,
      "x-api-limit-remaining",
      "x_api_limit_remaining",
    ),
    windowLimit: numericHeader(headers, "x-ratelimit-limit"),
    windowRemaining: numericHeader(
      headers,
      "x-ratelimit-remaining",
      "x_rate_limit_remaining",
    ),
    windowResetAt: reset ? new Date(reset * 1000).toISOString() : null,
  };
}

function providerMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const results = Reflect.get(payload, "results");
  if (!results || typeof results !== "object") return null;
  const message = Reflect.get(results, "message");
  return typeof message === "string" ? sanitizeNewsDataError(message) : null;
}

export async function fetchNewsDataPage(
  query: NewsDataRequestQuery,
): Promise<NewsDataPage> {
  const apiKey = env.server.newsDataApiKey;
  if (!apiKey) {
    throw new NewsDataRepositoryError(
      "MISSING_CONFIGURATION",
      "NewsData is not configured.",
    );
  }

  let response: Response;
  try {
    response = await fetch(buildNewsDataRequestUrl(apiKey, query), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new NewsDataRepositoryError(
      "UNAVAILABLE",
      "NewsData could not be reached.",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The sanitized status-specific error below is more useful than a JSON error.
  }

  if (response.status === 401 || response.status === 403) {
    throw new NewsDataRepositoryError(
      "UNAUTHORIZED",
      "NewsData authentication failed.",
    );
  }
  if (response.status === 429) {
    throw new NewsDataRepositoryError(
      "RATE_LIMITED",
      "NewsData request limits have been reached.",
    );
  }
  if (!response.ok) {
    throw new NewsDataRepositoryError(
      "UNAVAILABLE",
      providerMessage(payload) ?? "NewsData returned an unsuccessful response.",
    );
  }

  try {
    return { ...parseNewsDataResponse(payload), quota: quotaFrom(response.headers) };
  } catch {
    throw new NewsDataRepositoryError(
      "INVALID_RESPONSE",
      "NewsData returned an invalid response.",
    );
  }
}
