import Link from "next/link";

import { StoryPreviewMedia, type StoryVideoPreview } from "../common/story-preview-media";
import { StoryActionButtons } from "./story-action-buttons";

export type LedgerStory = Readonly<{
  id: string;
  href: string;
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
  author?: string;
  image: Readonly<{
    src: string;
    alt: string;
    unoptimized?: boolean;
  }>;
  videoPreview?: StoryVideoPreview | null;
}>;

type LedgerStoryRowProps = Readonly<{
  story: LedgerStory;
  locale: string;
  priority?: boolean;
  showActions?: boolean;
}>;

function formatPublishedAt(locale: string, publishedAt: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(publishedAt));
}

export function LedgerStoryRow({
  story,
  locale,
  priority = false,
  showActions = true,
}: LedgerStoryRowProps) {
  return (
    <article className="editorial-ledger-row log-row">
      <div className="editorial-ledger-meta">
        <span>{story.category}</span>
        <time dateTime={story.publishedAt}>{formatPublishedAt(locale, story.publishedAt)}</time>
        {story.author ? <small>{story.author}</small> : null}
      </div>
      <div className="editorial-ledger-image">
        <StoryPreviewMedia
          image={story.image}
          alt=""
          href={story.href}
          title={story.title}
          videoPreview={story.videoPreview}
          priority={priority}
          sizes="(max-width: 640px) 34vw, (max-width: 920px) 24vw, 220px"
        />
      </div>
      <div className="editorial-ledger-copy">
        <h3><Link href={story.href}>{story.title}</Link></h3>
        <p>{story.summary}</p>
      </div>
      {showActions ? <StoryActionButtons storyId={story.id} title={story.title} url={story.href} /> : null}
    </article>
  );
}
