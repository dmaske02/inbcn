import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/features/admin/auth/server";
import { HomepageBuilderLayout } from "@/features/homepage-renderer/components/homepage-builder-layout";
import { renderHomepageEditorPreview } from "@/features/homepage-builder/preview/homepage-editor-preview.service";
import {
  HOMEPAGE_LOCALES,
  type HomepageLocale,
} from "@/features/homepage-builder/homepage-builder.types";

export const metadata: Metadata = {
  title: { absolute: "Homepage Builder Preview" },
  description: null,
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

function parseLocale(value: string): HomepageLocale | null {
  return HOMEPAGE_LOCALES.includes(value as HomepageLocale)
    ? (value as HomepageLocale)
    : null;
}

function validSearchParams(searchParams: Record<string, string | string[] | undefined>): boolean {
  if (Object.keys(searchParams).some((key) => key !== "revision" && key !== "refresh")) return false;
  const revision = searchParams.revision;
  const refresh = searchParams.refresh;
  return [revision, refresh].every((value) => (
    value === undefined || (typeof value === "string" && /^\d{1,10}$/u.test(value))
  ));
}

export default async function HomepageBuilderPreviewPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [{ locale: rawLocale }, query, admin] = await Promise.all([
    params,
    searchParams,
    requireAdminUser(),
  ]);
  const locale = parseLocale(rawLocale);
  if (!locale || !validSearchParams(query)) notFound();

  const result = await renderHomepageEditorPreview(locale, admin);
  if (result.kind === "error") {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6">
        <section
          aria-labelledby="preview-error-heading"
          className="max-w-xl rounded-lg border border-destructive/30 bg-destructive/5 p-6"
          role="alert"
        >
          <h1 className="text-lg font-semibold" id="preview-error-heading">
            Homepage preview unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{result.error.message}</p>
          {result.error.blockType ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Affected section type: {result.error.blockType}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  return <HomepageBuilderLayout sections={result.sections} />;
}
