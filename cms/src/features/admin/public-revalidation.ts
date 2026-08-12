import "server-only";

import type { WebsiteRevalidationEvent } from "@inbcn/domain";

export async function revalidateWebsite(event: WebsiteRevalidationEvent): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const secret = process.env.WEBSITE_REVALIDATION_SECRET;
  if (!websiteUrl || !secret) {
    if (process.env.NODE_ENV === "production") throw new Error("Website revalidation is not configured.");
    return;
  }
  const response = await fetch(new URL("/api/revalidate", websiteUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ event }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Website revalidation failed with status ${response.status}.`);
}

export function revalidatePublicNews(): Promise<void> {
  return revalidateWebsite("stories");
}
