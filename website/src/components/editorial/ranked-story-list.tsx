import Link from "next/link";

type RankedStory = Readonly<{
  id: string;
  href: string;
  title: string;
}>;

type RankedStoryListProps = Readonly<{
  title: string;
  stories: readonly RankedStory[];
}>;

export function RankedStoryList({ title, stories }: RankedStoryListProps) {
  const titleId = `ranked-${title.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/(^-|-$)/gu, "") || "stories"}`;

  return (
    <section className="editorial-ranked" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <ol>
        {stories.map((story, index) => (
          <li key={story.id}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <Link href={story.href}>{story.title}</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
