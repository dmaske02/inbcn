import type { PreparedHomepageSection } from "../homepage-renderer.types.ts";

export type HomepageLayoutItem = Readonly<{
  kind: "section";
  section: PreparedHomepageSection;
}> | Readonly<{
  kind: "hero-composition";
  hero: PreparedHomepageSection;
  sidebar: PreparedHomepageSection;
}>;

export function composeHomepageLayout(
  sections: readonly PreparedHomepageSection[],
): readonly HomepageLayoutItem[] {
  const items: HomepageLayoutItem[] = [];
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    if (section.node === null) continue;
    const next = sections[index + 1];
    if (
      section.type === "hero-story"
      && next?.type === "hero-sidebar"
      && next.node !== null
    ) {
      items.push({ kind: "hero-composition", hero: section, sidebar: next });
      index += 1;
      continue;
    }
    items.push({ kind: "section", section });
  }
  return items;
}
