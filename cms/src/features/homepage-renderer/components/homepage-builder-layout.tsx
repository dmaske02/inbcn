import type { PreparedHomepageSection } from "../homepage-renderer.types";
import { composeHomepageLayout } from "./homepage-builder-layout.model";

const widthClasses = {
  full: "col-span-12",
  half: "col-span-12 lg:col-span-6",
  third: "col-span-12 md:col-span-6 lg:col-span-4",
  quarter: "col-span-12 md:col-span-6 lg:col-span-3",
} as const;

const templateOrder: Readonly<Record<PreparedHomepageSection["type"], number>> = {
  "advertisement-placeholder": 10,
  "hero-story": 20,
  "hero-sidebar": 25,
  "breaking-news": 30,
  "latest-news": 40,
  trending: 50,
  opinion: 60,
  "category-section": 80,
  "live-tv": 90,
  "custom-html-placeholder": 100,
  "future-placeholder": 110,
};

function SectionFrame({ section, selected }: Readonly<{ section: PreparedHomepageSection; selected: boolean }>) {
  const width = section.type === "hero-sidebar" ? "full" : section.width;
  return (
    <section
      className={`${widthClasses[width]} homepage-preview-section ${selected ? "homepage-preview-selected" : ""}`}
      data-homepage-container={section.container}
      data-homepage-selected={selected || undefined}
      data-homepage-section-type={section.type}
    >
      {section.node}
    </section>
  );
}

export function HomepageBuilderLayout({
  sections,
  selectedSectionId,
}: Readonly<{ sections: readonly PreparedHomepageSection[]; selectedSectionId?: string | null }>) {
  const orderedSections = [...sections].sort((left, right) => (
    templateOrder[left.type] - templateOrder[right.type] || left.position - right.position
  ));
  const layout = composeHomepageLayout(orderedSections);
  const consumed = new Set<string>();
  return (
    <main className="public-site editorial-page editorial-homepage">
      <div className="editorial-container editorial-homepage-inner">
        <div className="editorial-builder-grid">
          {layout.map((item, index) => {
            if (item.kind === "section" && consumed.has(item.section.id)) return null;
            if (item.kind === "section" && item.section.type === "trending") {
              const next = layout[index + 1];
              if (next?.kind === "section" && next.section.type === "opinion") {
                consumed.add(next.section.id);
                return (
                  <div className="editorial-home-discovery homepage-preview-section" key={`${item.section.id}:${next.section.id}`} data-homepage-selected={selectedSectionId === item.section.id || selectedSectionId === next.section.id || undefined}>
                    <SectionFrame section={item.section} selected={selectedSectionId === item.section.id} />
                    <SectionFrame section={next.section} selected={selectedSectionId === next.section.id} />
                  </div>
                );
              }
            }
            return item.kind === "hero-composition" ? (
            <section
              aria-label="Featured stories"
              className={`editorial-builder-hero-composition homepage-preview-section ${selectedSectionId === item.hero.id || selectedSectionId === item.sidebar.id ? "homepage-preview-selected" : ""}`}
              data-homepage-selected={selectedSectionId === item.hero.id || selectedSectionId === item.sidebar.id || undefined}
              key={`${item.hero.id}:${item.sidebar.id}`}
            >
              <div>{item.hero.node}</div>
              {item.sidebar.node}
            </section>
            ) : <SectionFrame key={item.section.id} section={item.section} selected={selectedSectionId === item.section.id} />;
          })}
        </div>
      </div>
    </main>
  );
}
