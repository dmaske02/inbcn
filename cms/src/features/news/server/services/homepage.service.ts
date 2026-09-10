import "server-only";

import { cache } from "react";
import { getPublicBreakingAlerts } from "@/features/alerts/breaking-alerts.service";
import { getCategories } from "../categories.repository";
import { getStoriesByLanguage, getPublishedStoryById, getExplicitEditorsPicks } from "../stories.repository";
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
  const selected = homepage.all[0];
  if (!selected) return null;
  return { ...selected, image: await resolveAvailablePublicStoryImage(selected.image) };
});

export const getHomepageData = cache(async function getHomepageData(
  locale: string,
): Promise<HomepageViewModel> {
  const [stories, categories, alerts, explicitPicks] = await Promise.all([
    getStoriesByLanguage(locale),
    getCategories(locale),
    getPublicBreakingAlerts(locale),
    getExplicitEditorsPicks(locale),
  ]);

  let homepage = composeHomepageData(
    locale,
    stories,
    categories,
    env.public.cloudinaryCloudName,
    alerts,
  );
  const picked = composeHomepageData(locale, explicitPicks, categories, env.public.cloudinaryCloudName).all;
  const pickedIds = new Set(picked.map(story => story.id));
  homepage = { ...homepage, all: [...homepage.all.filter(story => !pickedIds.has(story.id)), ...picked],
    editorPicks: [...picked, ...homepage.editorPicks.filter(story => !pickedIds.has(story.id))] };
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
