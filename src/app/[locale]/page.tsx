import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ErrorState } from "@/components/common/error-state";
import { Container } from "@/components/layout/container";
import { Homepage } from "@/features/news/components/homepage";
import { HomepageSkeleton } from "@/features/news/components/homepage-skeleton";
import { getHomepageData } from "@/features/news/server/services/homepage.service";
import type { HomepageViewModel } from "@/features/news/server/services/homepage.service";
import { routing } from "@/i18n/routing";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

type HomepageLoadResult =
  | { data: HomepageViewModel; failed: false }
  | { data: null; failed: true };

async function loadHomepage(locale: string): Promise<HomepageLoadResult> {
  try {
    const data = await getHomepageData(locale);
    return { data, failed: false };
  } catch {
    return { data: null, failed: true };
  }
}

async function HomepageContent({ locale }: { locale: string }) {
  const result = await loadHomepage(locale);

  if (result.failed) {
    const t = await getTranslations({ locale, namespace: "homepage.error" });
    return (
      <Container className="max-w-[1360px] px-6 py-16">
        <ErrorState title={t("title")} description={t("description")} />
      </Container>
    );
  }

  return <Homepage locale={locale} data={result.data} />;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <Suspense fallback={<HomepageSkeleton />}>
      <HomepageContent locale={locale} />
    </Suspense>
  );
}
