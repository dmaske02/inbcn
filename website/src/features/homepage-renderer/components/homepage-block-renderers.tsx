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

export function renderOpinion(section: ResolvedHomepageSection, locale: string) {
  return <HomepageEditorsSection locale={locale} title={section.title} stories={requireKind(section, "stories").stories} />;
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
  const stream = view.mode === "live" ? view.stream : null;

  return (
    <section className="editorial-builder-live editorial-live-briefing">
      <header className="editorial-builder-live-header">
        <p>{stream ? view.labels.live : view.labels.offline}</p>
        <h2>{section.title}</h2>
      </header>
      {stream ? (
        <div className="editorial-live-programme">
          <LiveTvPlayer
            programme={stream}
            ariaLabel={view.labels.playerLabel ?? view.labels.pageTitle}
            liveLabel={view.labels.live}
            labels={view.labels.player}
          />
          <div className="editorial-live-programme-copy">
            <div>
              <p className="editorial-live-kicker">{view.labels.nowPlaying}</p>
              <h3>{stream.title}</h3>
              <p>{stream.description}</p>
            </div>
            <div className="editorial-live-programme-meta">
              <strong>{stream.statusLabel}</strong>
              <small>{stream.providerLabel}</small>
            </div>
          </div>
        </div>
      ) : (
        <p className="editorial-builder-live-offline">{view.offline.message}</p>
      )}
      <section className="editorial-live-schedule editorial-live-schedule-builder" aria-label={view.labels.sections.schedule}>
        <h3>{view.labels.sections.schedule}</h3>
        {view.schedule.length ? (
          <ol>
            {view.schedule.map((item) => (
              <li key={item.id} data-current={item.isCurrent ? "true" : undefined}>
                <time dateTime={item.startsAt ?? undefined}>{item.timeLabel}</time>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
                <span>{view.labels.schedule[item.state]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="editorial-live-schedule-empty">{view.offline.message}</p>
        )}
      </section>
    </section>
  );
}
