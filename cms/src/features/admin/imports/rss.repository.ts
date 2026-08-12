import "server-only";

import { requestRssFeed } from "./rss.request";

export async function fetchRssFeed(feedUrl: string) {
  return requestRssFeed(feedUrl);
}

export { RssRepositoryError } from "./rss.request";
