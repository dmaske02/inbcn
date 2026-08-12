import { z } from "zod";

const NEWS_DATA_LATEST_ENDPOINT = "https://newsdata.io/api/1/latest";
const MAX_REQUEST_SIZE = 10;

const successResponseSchema = z.object({
  status: z.literal("success"),
  totalResults: z.number().int().nonnegative().optional().default(0),
  results: z.array(z.unknown()),
  nextPage: z.string().min(1).nullable().optional(),
});

export type NewsDataRequestQuery = Readonly<{
  country: string | null;
  language: string | null;
  page: string | null;
  size: number;
}>;

export type NewsDataResponsePage = Readonly<{
  totalResults: number;
  articles: readonly unknown[];
  nextPage: string | null;
}>;

export function buildNewsDataRequestUrl(
  apiKey: string,
  query: NewsDataRequestQuery,
): URL {
  const url = new URL(NEWS_DATA_LATEST_ENDPOINT);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set(
    "size",
    String(Math.min(MAX_REQUEST_SIZE, Math.max(1, Math.trunc(query.size)))),
  );
  url.searchParams.set("removeduplicate", "1");
  if (query.country) url.searchParams.set("country", query.country);
  if (query.language) url.searchParams.set("language", query.language);
  if (query.page) url.searchParams.set("page", query.page);
  return url;
}

export function parseNewsDataResponse(input: unknown): NewsDataResponsePage {
  const parsed = successResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("NewsData response was invalid.");
  }
  return {
    totalResults: parsed.data.totalResults,
    articles: parsed.data.results,
    nextPage: parsed.data.nextPage ?? null,
  };
}

export function sanitizeNewsDataError(message: string): string {
  return message
    .replace(/apikey=([^&\s]+)/giu, "apikey=[redacted]")
    .replace(/pub_[A-Za-z0-9_-]+/gu, "[redacted]");
}
