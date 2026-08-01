import "server-only";

import { getCategories } from "../categories.repository";
import { getStoriesByLanguage } from "../stories.repository";
import {
  composeHomepageData,
  type HomepageViewModel,
} from "./homepage.model";
import { env } from "@/config/env";

export async function getHomepageData(
  locale: string,
): Promise<HomepageViewModel> {
  const [stories, categories] = await Promise.all([
    getStoriesByLanguage(locale),
    getCategories(locale),
  ]);

  return composeHomepageData(
    locale,
    stories,
    categories,
    env.public.cloudinaryCloudName,
  );
}

export type {
  HomepageCategorySection,
  HomepageCategorySlug,
  HomepageStory,
  HomepageViewModel,
} from "./homepage.model";
