import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);
const localeLikeSegment = /^[a-z]{2}$/i;

export default async function proxy(request: NextRequest) {
  const sessionResponse = await updateSession(request);

  if (request.nextUrl.pathname.startsWith("/admin")) {
    return sessionResponse;
  }

  const [, firstSegment] = request.nextUrl.pathname.split("/");

  if (
    localeLikeSegment.test(firstSegment) &&
    !routing.locales.some((locale) => locale === firstSegment)
  ) {
    return sessionResponse;
  }

  const intlResponse = handleI18nRouting(request);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie);
  });

  return intlResponse;
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
