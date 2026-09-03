import { EditorialSponsorRow } from "@/components/editorial";
import type { HomepageViewModel } from "@/features/news/server/services/homepage.service";
import {
  HomepageCategoryRails,
  HomepageEditorsSection,
  HomepageFeedSection,
  HomepageHeadlineSection,
  HomepageHeroSection,
  HomepageRankedSection,
} from "./homepage-sections";

type HomepageProps = Readonly<{
  locale: string;
  data: HomepageViewModel;
}>;

export async function Homepage({ locale, data }: HomepageProps) {
  return (
    <div className="editorial-page editorial-homepage">
      <div className="editorial-container editorial-homepage-inner">
        <EditorialSponsorRow label="Advertisement" slotId="homepage-leaderboard" />

        {data.featured ? (
          <HomepageHeroSection locale={locale} story={data.featured} />
        ) : null}

        {data.topHeadlines.length ? (
          <HomepageHeadlineSection stories={data.topHeadlines} />
        ) : null}

        {data.latest.length ? (
          <HomepageFeedSection locale={locale} title="Latest news" stories={data.latest} />
        ) : null}

        {data.trending.length || data.editorPicks.length ? (
          <div className="editorial-home-discovery">
            {data.trending.length ? (
              <HomepageRankedSection title="Most read" stories={data.trending} />
            ) : <div />}
            {data.editorPicks.length ? (
              <HomepageEditorsSection stories={data.editorPicks} />
            ) : null}
          </div>
        ) : null}

        <EditorialSponsorRow label="Sponsored" slotId="homepage-mid-feed" />

        {data.categoryRails.length ? (
          <HomepageCategoryRails locale={locale} rails={data.categoryRails} />
        ) : null}
      </div>
    </div>
  );
}
