import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getLanguage } from "@/features/news/server/languages.repository";
import {
  getPublishedReporterStories,
} from "@/features/news/server/stories.repository";
import type { StorySummaryDto } from "@/features/news/server/dto";
import {
  buildPublicReporterUrl,
  mapPublicReporter,
  type PublicReporter,
} from "./public-reporter.model";
import { assertRepositoryQuerySucceeded } from "@/features/news/server/errors";

const PUBLIC_REPORTER_COLUMNS =
  "public_slug, legal_display_name, avatar_url, public_status, home_district, bio, beats" as const;

export type PublicReporterProfile = Readonly<{
  reporter: PublicReporter;
  stories: readonly StorySummaryDto[];
}>;

export const getPublicReporter = cache(async (
  slug: string,
  locale: string,
): Promise<PublicReporterProfile | null> => {
  if (!buildPublicReporterUrl(locale, slug)) return null;

  const language = await getLanguage(locale);
  if (!language) return null;

  const supabase = await createClient();
  const profileQuery = supabase
    .from("public_reporter_profiles")
    .select(PUBLIC_REPORTER_COLUMNS)
    .eq("public_slug", slug)
    .maybeSingle();
  const storiesQuery = getPublishedReporterStories(language.id, slug);
  const [profileResult, stories] = await Promise.all([
    profileQuery,
    storiesQuery,
  ]);

  assertRepositoryQuerySucceeded(profileResult.error, "load public reporter");
  const reporter = mapPublicReporter(profileResult.data);
  return reporter ? { reporter, stories } : null;
});
