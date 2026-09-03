import {
  EditorialSectionHeader,
  EditorialSponsorRow,
} from "@/components/editorial";
import {
  HomepageCategoryRails,
  HomepageEditorsSection,
  HomepageFeedSection,
  HomepageHeadlineSection,
  HomepageHeroSection,
  HomepageRankedSection,
} from "@/features/news/components/homepage-sections";
import { LiveTvPlayer } from "@/features/live-tv/player/live-tv-player";
import type { LiveTvPageViewModel } from "@/features/live-tv/server/live-tv-page.model";
import { HomepageRendererError } from "../homepage-renderer.model";
import type { ResolvedHomepageSection } from "../homepage-renderer.types";
import { HeroSidebarRenderer } from "./hero-sidebar-renderer";

function requireKind<K extends ResolvedHomepageSection["data"]["kind"]>(
  section: ResolvedHomepageSection,
  kind: K,
): Extract<ResolvedHomepageSection["data"], { kind: K }> {
  if (section.data.kind !== kind) {
    throw new HomepageRendererError(
      "CONTRACT_FAILED",
      `Renderer data for ${section.type} is invalid.`,
      { blockId: section.blockId, blockType: section.type },
    );
  }
  return section.data as Extract<ResolvedHomepageSection["data"], { kind: K }>;
}

export function renderHeroStory(section: ResolvedHomepageSection, locale: string) {
  const { story } = requireKind(section, "story");
  return <HomepageHeroSection locale={locale} story={story} />;
}

export function renderHeroSidebar(section: ResolvedHomepageSection, locale: string) {
  const { stories } = requireKind(section, "hero-sidebar");
  return <HeroSidebarRenderer locale={locale} stories={stories} title={section.title} />;
}

export function renderBreakingNews(section: ResolvedHomepageSection) {
  return <HomepageHeadlineSection title={section.title} stories={requireKind(section, "stories").stories} />;
}

export function renderLatestNews(section: ResolvedHomepageSection, locale: string) {
  return <HomepageFeedSection locale={locale} title={section.title} stories={requireKind(section, "stories").stories} />;
}

export function renderCategorySection(section: ResolvedHomepageSection, locale: string) {
  const { category, stories } = requireKind(section, "category");
  return <HomepageCategoryRails locale={locale} title={section.title} rails={[{ category, stories }]} />;
}

export function renderTrending(section: ResolvedHomepageSection) {
  return <HomepageRankedSection title={section.title} stories={requireKind(section, "stories").stories} />;
}

export function renderOpinion(section: ResolvedHomepageSection) {
  return <HomepageEditorsSection title={section.title} stories={requireKind(section, "stories").stories} />;
}

export function renderAdvertisement(section: ResolvedHomepageSection) {
  return <EditorialSponsorRow label={requireKind(section, "placeholder").label} slotId={section.id} />;
}

export function renderCustomHtmlPlaceholder(section: ResolvedHomepageSection) {
  const data = requireKind(section, "placeholder");
  return (
    <section className="editorial-builder-placeholder" aria-label={data.label}>
      <EditorialSectionHeader title={data.label} />
      {data.detail ? <p>{data.detail}</p> : null}
    </section>
  );
}

export function renderFuturePlaceholder(section: ResolvedHomepageSection) {
  const data = requireKind(section, "placeholder");
  return (
    <section className="editorial-builder-placeholder" aria-label={data.label}>
      <EditorialSectionHeader title={data.label} />
      {data.detail ? <p>{data.detail}</p> : null}
    </section>
  );
}

export function renderLiveTv(section: ResolvedHomepageSection) {
  const data = requireKind(section, "live-tv");
  const view = data.view as LiveTvPageViewModel;
  if (view.mode !== "live" || !view.stream) {
    return (
      <section className="editorial-builder-live">
        <EditorialSectionHeader title={section.title} />
        <p>{view.offline.message}</p>
      </section>
    );
  }
  return (
    <section className="editorial-builder-live">
      <EditorialSectionHeader title={section.title} />
      <LiveTvPlayer
        programme={view.stream}
        ariaLabel={view.labels.playerLabel ?? view.labels.pageTitle}
        liveLabel={view.labels.live}
        labels={view.labels.player}
      />
    </section>
  );
}
