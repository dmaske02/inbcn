import { websiteRevalidationEvents, type WebsiteRevalidationEvent } from "@inbcn/domain";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const pathsByEvent: Readonly<Record<WebsiteRevalidationEvent, readonly string[]>> = {
  all: ["/[locale]"],
  stories: ["/[locale]"],
  alerts: ["/[locale]"],
  media: ["/[locale]"],
  "live-tv": ["/[locale]/live-tv"],
  homepage: ["/[locale]"],
};

export async function POST(request: Request) {
  const secret = process.env.WEBSITE_REVALIDATION_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const event = body && typeof body === "object" ? Reflect.get(body, "event") : null;
  if (!websiteRevalidationEvents.some((candidate) => candidate === event)) {
    return NextResponse.json({ error: "Invalid revalidation event" }, { status: 400 });
  }

  for (const path of pathsByEvent[event as WebsiteRevalidationEvent]) {
    revalidatePath(path, "layout");
  }
  return NextResponse.json({ revalidated: true, event });
}
