import "server-only";

import { cache } from "react";
import { getPublicBreakingAlerts } from "@/features/alerts/breaking-alerts.service";
import { getCategories } from "../categories.repository";
import { getStoriesByLanguage, getPublishedStoryById } from "../stories.repository";
import {
  composeHomepageData,
  type HomepageViewModel,
} from "./homepage.model";
import { env } from "@/config/env";
import { resolveAvailablePublicStoryImage } from "./public-story.mjs";

export const getConfiguredHomepageStory = cache(async (locale: string, id: string): Promise<HomepageViewModel["featured"]> => {
  const story = await getPublishedStoryById(locale, id);
  if (!story) return null;
  const categories = await getCategories(locale);
  const homepage = composeHomepageData(locale, [story], categories, env.public.cloudinaryCloudName, []);
  if (!homepage.featured) return null;
  return { ...homepage.featured, image: await resolveAvailablePublicStoryImage(homepage.featured.image) };
});

export const getHomepageData = cache(async function getHomepageData(
  locale: string,
): Promise<HomepageViewModel> {
  const [stories, categories, alerts] = await Promise.all([
    getStoriesByLanguage(locale),
    getCategories(locale),
    getPublicBreakingAlerts(locale),
  ]);

  const homepage = composeHomepageData(
    locale,
    stories,
    categories,
    env.public.cloudinaryCloudName,
    alerts,
  );
  if (!homepage.featured) return homepage;

  const heroImage = await resolveAvailablePublicStoryImage(homepage.featured.image);
  return {
    ...homepage,
    featured: { ...homepage.featured, image: heroImage },
  };
});

export type {
  HomepageCategorySection,
  HomepagePinnedAlert,
  HomepageStory,
  HomepageViewModel,
} from "./homepage.model";
