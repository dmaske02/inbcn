import { Fragment } from "react";

import {
  EditorialSponsorRow,
  LedgerStoryRow,
  type LedgerStory,
} from "@/components/editorial";

const SPONSOR_AFTER_STORIES = 3;

export function EditorialListingFeed({
  stories,
  locale,
  sponsorLabel,
  sponsorSlotId,
  priorityFirst = false,
}: Readonly<{
  stories: readonly LedgerStory[];
  locale: string;
  sponsorLabel: string;
  sponsorSlotId: string;
  priorityFirst?: boolean;
}>) {
  return (
    <div className="editorial-listing-feed">
      {stories.map((story, index) => (
        <Fragment key={story.id}>
          <LedgerStoryRow
            story={story}
            locale={locale}
            priority={priorityFirst && index === 0}
          />
          {index + 1 === SPONSOR_AFTER_STORIES && index < stories.length - 1 ? (
            <EditorialSponsorRow label={sponsorLabel} slotId={sponsorSlotId} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
