import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export default async function proxy(request: NextRequest) {
  const sessionResponse = await updateSession(request);

  return sessionResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/homepage-builder-preview/:path*"],
};
