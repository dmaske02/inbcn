import { z } from "zod";

const uuid = z.uuid();
const empty = z.object({}).strict();
const list = z.object({ limit: z.number().int().min(1).max(100).default(12) }).strict();
const heroSidebar = z.object({
  storyIds: z.array(uuid).min(1).max(3).refine(
    (items) => new Set(items).size === items.length,
    "Hero Sidebar stories must be unique.",
  ),
}).strict();
const heroSidebarDefaults: { storyIds: string[] } = { storyIds: [] };
const definitions = [
  ["hero-story", "Hero Story", "hero-story", z.object({ storyId: uuid }).strict(), { storyId: "" }],
  ["hero-sidebar", "Hero Sidebar", "hero-sidebar", heroSidebar, heroSidebarDefaults],
  ["breaking-news", "Breaking News", "breaking-news", list, { limit: 10 }],
  ["live-tv", "Live TV", "live-tv", empty, {}],
  ["latest-news", "Latest News", "latest-news", list, { limit: 12 }],
  ["category-section", "Category Section", "category-section", z.object({ categoryId: uuid, limit: z.number().int().min(1).max(100).default(8) }).strict(), { categoryId: "", limit: 8 }],
  ["trending", "Trending", "trending", list, { limit: 8 }],
  ["opinion", "Opinion", "opinion", list, { limit: 6 }],
  ["advertisement-placeholder", "Advertisement Placeholder", "advertisement-placeholder", z.object({ label: z.string().trim().min(1).max(120).default("Advertisement") }).strict(), { label: "Advertisement" }],
  ["custom-html-placeholder", "Custom HTML Placeholder", "custom-html-disabled", z.object({ content: z.string().max(10000).default("") }).strict(), { content: "" }],
  ["future-placeholder", "Future Placeholder", "future-placeholder", z.object({ note: z.string().max(500).default("") }).strict(), { note: "" }],
] as const;

export const HOMEPAGE_BLOCK_REGISTRY = definitions.map(([id, type, renderer, schema, defaults]) => ({ id, type, renderer, schema, defaults, validate: (value: unknown) => schema.safeParse(value) }));
export function getHomepageBlockDefinition(id: string) { return HOMEPAGE_BLOCK_REGISTRY.find((item) => item.id === id) ?? null; }
