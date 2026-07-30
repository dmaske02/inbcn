import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);
const localeLikeSegment = /^[a-z]{2}$/i;

export default function proxy(request: NextRequest) {
  const [, firstSegment] = request.nextUrl.pathname.split("/");

  if (
    localeLikeSegment.test(firstSegment) &&
    !routing.locales.some((locale) => locale === firstSegment)
  ) {
    return NextResponse.next();
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: "/((?!api|admin|trpc|_next|_vercel|.*\\..*).*)",
};
