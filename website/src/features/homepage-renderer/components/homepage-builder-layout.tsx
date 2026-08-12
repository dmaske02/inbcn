import type { PreparedHomepageSection } from "../homepage-renderer.types";
import { composeHomepageLayout } from "./homepage-builder-layout.model";

const widthClasses = {
  full: "col-span-12",
  half: "col-span-12 lg:col-span-6",
  third: "col-span-12 md:col-span-6 lg:col-span-4",
  quarter: "col-span-12 md:col-span-6 lg:col-span-3",
} as const;

function SectionFrame({ section }: Readonly<{ section: PreparedHomepageSection }>) {
  const width = section.type === "hero-sidebar" ? "full" : section.width;
  return (
    <section
      className={widthClasses[width]}
      data-homepage-container={section.container}
      data-homepage-section-type={section.type}
    >
      {section.node}
    </section>
  );
}

export function HomepageBuilderLayout({
  sections,
}: Readonly<{ sections: readonly PreparedHomepageSection[] }>) {
  const layout = composeHomepageLayout(sections);
  return (
    <main className="proto-page">
      <div className="proto-wrap">
        <div className="grid grid-cols-12 gap-7">
          {layout.map((item) => item.kind === "hero-composition" ? (
            <section
              aria-label="Featured stories"
              className="proto-hero-composition col-span-12"
              key={`${item.hero.id}:${item.sidebar.id}`}
            >
              <div className="proto-hero-composition-main">{item.hero.node}</div>
              <div className="proto-hero-composition-sidebar">{item.sidebar.node}</div>
            </section>
          ) : <SectionFrame key={item.section.id} section={item.section} />)}
        </div>
      </div>
    </main>
  );
}
