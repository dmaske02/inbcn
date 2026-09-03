import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { localeRoutingHeaders, routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);
const localeLikeSegment = /^[a-z]{2}$/i;

export default function proxy(request: NextRequest) {
  const [, firstSegment] = request.nextUrl.pathname.split("/");

  if (
    localeLikeSegment.test(firstSegment) &&
    !routing.locales.some((locale) => locale === firstSegment)
  ) {
    return new Response("Not Found", { status: 404 });
  }

  return handleI18nRouting(
    new NextRequest(request, { headers: localeRoutingHeaders(request.headers) }),
  );
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
