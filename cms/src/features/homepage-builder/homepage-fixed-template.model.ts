import type { HomepageEditorDraft } from "./editor/homepage-editor.types";

export type FixedHomepageTemplateItem = Readonly<{
  key: string;
  selectionId: string;
  label: string;
  description: string;
  draft: HomepageEditorDraft | null;
  fixed?: boolean;
}>;

const FIXED_SELECTION_PREFIX = "fixed:";
const FIXED_SELECTION_IDS = new Set([
  "fixed:public-header",
  "fixed:leaderboard",
  "fixed:hero",
  "fixed:hero-sidebar",
  "fixed:headlines",
  "fixed:latest",
  "fixed:most-read",
  "fixed:editors-picks",
  "fixed:mid-feed-ad",
  "fixed:category-rails",
  "fixed:public-footer",
]);

export function isFixedHomepageSelectionId(value: string): boolean {
  return FIXED_SELECTION_IDS.has(value);
}

function draftBase(id: string, title: string) {
  return { id, blockId: id, title, container: "main" as const, width: "full" as const, enabled: true, startsAt: null, endsAt: null };
}

export function createMissingFixedHomepageDrafts(drafts: readonly HomepageEditorDraft[]): HomepageEditorDraft[] {
  const counts = new Map<HomepageEditorDraft["blockType"], number>();
  for (const draft of drafts) counts.set(draft.blockType, (counts.get(draft.blockType) ?? 0) + 1);
  const missing: HomepageEditorDraft[] = [];
  if (!counts.has("hero-sidebar")) missing.push({ ...draftBase("fixed:hero-sidebar", "Hero supporting stories"), blockType: "hero-sidebar", storyIds: [] });
  if (!counts.has("breaking-news")) missing.push({ ...draftBase("fixed:headlines", "Top Headlines"), blockType: "breaking-news", limit: 3 });
  if (!counts.has("latest-news")) missing.push({ ...draftBase("fixed:latest", "Latest News"), blockType: "latest-news", limit: 12 });
  if (!counts.has("trending")) missing.push({ ...draftBase("fixed:most-read", "Most Read"), blockType: "trending", limit: 8 });
  if (!counts.has("opinion")) missing.push({ ...draftBase("fixed:editors-picks", "Editor’s Picks"), blockType: "opinion", limit: 6 });
  if ((counts.get("advertisement-placeholder") ?? 0) < 1) missing.push({ ...draftBase("fixed:leaderboard", "Leaderboard advertisement"), blockType: "advertisement-placeholder", label: "Header advertisement" });
  if ((counts.get("advertisement-placeholder") ?? 0) < 2) missing.push({ ...draftBase("fixed:mid-feed-ad", "Mid-feed sponsored slot"), blockType: "advertisement-placeholder", label: "Inline advertisement" });
  if (!counts.has("category-section")) missing.push({ ...draftBase("fixed:category-rails", "Across the newsroom"), blockType: "category-section", categoryId: "", limit: 8 });
  return missing;
}

function takeFirst(drafts: HomepageEditorDraft[], type: HomepageEditorDraft["blockType"]): HomepageEditorDraft | null {
  const index = drafts.findIndex((draft) => draft.blockType === type);
  return index < 0 ? null : drafts.splice(index, 1)[0] ?? null;
}

function item(key: string, label: string, draft: HomepageEditorDraft | null, fixed = false): FixedHomepageTemplateItem {
  return {
    key,
    selectionId: draft?.id ?? `${FIXED_SELECTION_PREFIX}${key}`,
    label,
    description: fixed ? "Fixed site chrome." : draft ? "Edit this section’s content and settings." : "Uses the public homepage default.",
    draft,
    fixed,
  };
}

export function getFixedHomepageTemplate(drafts: readonly HomepageEditorDraft[]): FixedHomepageTemplateItem[] {
  const remaining = [...drafts];
  const advertisementOne = takeFirst(remaining, "advertisement-placeholder");
  const hero = takeFirst(remaining, "hero-story");
  const heroSidebar = takeFirst(remaining, "hero-sidebar");
  const headlines = takeFirst(remaining, "breaking-news");
  const latest = takeFirst(remaining, "latest-news");
  const mostRead = takeFirst(remaining, "trending");
  const editorsPicks = takeFirst(remaining, "opinion");
  const advertisementTwo = takeFirst(remaining, "advertisement-placeholder");
  const categories = remaining.filter((draft) => draft.blockType === "category-section");
  const categoryIds = new Set(categories.map((draft) => draft.id));
  const extensions = remaining.filter((draft) => !categoryIds.has(draft.id));

  return [
    item("public-header", "Public header", null, true),
    item("leaderboard", "Leaderboard advertisement", advertisementOne),
    item("hero", "Hero Story", hero),
    item("hero-sidebar", "Hero supporting stories", heroSidebar),
    item("headlines", "Top Headlines", headlines),
    item("latest", "Latest News", latest),
    item("most-read", "Most Read", mostRead),
    item("editors-picks", "Editor’s Picks", editorsPicks),
    item("mid-feed-ad", "Mid-feed sponsored slot", advertisementTwo),
    ...(categories.length
      ? categories.map((draft, index) => item(`category-${draft.id}`, index === 0 ? "Across the newsroom" : draft.title, draft))
      : [item("category-rails", "Across the newsroom", null)]),
    ...extensions.map((draft) => item(`extension-${draft.id}`, draft.title, draft)),
    item("public-footer", "Public footer", null, true),
  ];
}
