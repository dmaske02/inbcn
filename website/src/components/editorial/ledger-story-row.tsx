import Image from "next/image";
import Link from "next/link";

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
      <Link className="editorial-ledger-image" href={story.href} tabIndex={-1} aria-hidden="true">
        <Image
          src={story.image.src}
          alt=""
          fill
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          unoptimized={story.image.unoptimized}
          sizes="(max-width: 640px) 34vw, (max-width: 920px) 24vw, 220px"
        />
      </Link>
      <div className="editorial-ledger-copy">
        <h3><Link href={story.href}>{story.title}</Link></h3>
        <p>{story.summary}</p>
      </div>
      {showActions ? <StoryActionButtons storyId={story.id} title={story.title} url={story.href} /> : null}
    </article>
  );
}
