import Image from "next/image";
import Link from "next/link";
import type { HomepageStory, HomepageViewModel } from "@/features/news/server/services/homepage.service";
import { getHeroImagePresentation } from "@/features/news/server/services/story-reader.model";

type HomepageProps = { locale: string; data: HomepageViewModel };

function publishedLabel(locale: string, publishedAt: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(publishedAt));
}

function StoryImage({ story, className, priority = false }: { story: HomepageStory; className: string; priority?: boolean }) {
  const presentation = priority ? getHeroImagePresentation(story.image) : null;
  return <div className={className} style={{ position: "relative" }}><Image src={story.image.src} alt={story.image.alt} fill priority={priority} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} unoptimized={story.image.unoptimized} className="object-cover" style={presentation ? { objectFit: presentation.objectFit, objectPosition: presentation.objectPosition, maxWidth: presentation.maxWidth, maxHeight: presentation.maxHeight, margin: "auto" } : undefined} sizes="(min-width: 1024px) 40vw, 100vw" /></div>;
}

export async function Homepage({ locale, data }: HomepageProps) {
  const heroDeck = data.editorPicks.slice(0, 3);
  const lowerEditorPicks = data.editorPicks.slice(3);
  return <main className="proto-page"><div className="proto-wrap">
    <div className="proto-ad-slot"><span>Advertisement</span><small>728 × 90 reserved</small></div>

    {data.featured && <section className="proto-hero-grid" aria-label="Featured story">
      <article className="proto-hero-card"><StoryImage story={data.featured} className="proto-photo proto-hero-photo" priority /><div className="proto-hero-copy"><div className="proto-label">Featured story</div><h1><Link href={data.featured.href}>{data.featured.title}</Link></h1><p>{data.featured.summary}</p><div className="proto-story-meta">{data.featured.categoryName} · {publishedLabel(locale, data.featured.publishedAt)}</div><div className="proto-hero-actions"><Link href={data.featured.href}>Read full analysis</Link><button>Save for later</button></div></div></article>
      {heroDeck.length > 0 && <div className="proto-hero-deck">{heroDeck.map((story) => <article className="proto-brief" key={story.id}><StoryImage story={story} className="proto-rail-image" /><span className="proto-badge verified">Editor&apos;s pick</span><h2><Link href={story.href}>{story.title}</Link></h2><p>{story.summary}</p></article>)}</div>}
    </section>}

    {data.topHeadlines.length > 0 && <section className="proto-section"><div className="proto-section-head"><h2>Top headlines</h2><div className="proto-section-rule" /><button aria-label="Previous headlines">←</button><button aria-label="Next headlines">→</button></div><div className="proto-headline-row">{data.topHeadlines.map((story, index) => <article className="proto-headline" key={story.id}><span>{String(index+1).padStart(2,"0")}</span><div><div className="proto-label">{story.categoryName}</div><h3><Link href={story.href}>{story.title}</Link></h3><p>{story.summary}</p></div></article>)}</div></section>}

    {(data.latest.length > 0 || data.trending.length > 0) && <div className="proto-content-grid">
      {data.latest.length > 0 && <section className="proto-section"><div className="proto-section-head"><h2>Latest news</h2><div className="proto-section-rule" /><Link href={`/${locale}/search`}>View all</Link></div><div className="proto-feed">{data.latest.map((story) => <article className="proto-feed-card" key={story.id}><StoryImage story={story} className="proto-thumb" /><div><div className="proto-label">{story.categoryName}</div><h3><Link href={story.href}>{story.title}</Link></h3><p>{story.summary}</p><small>{publishedLabel(locale, story.publishedAt)}</small></div></article>)}</div></section>}
      <aside className="proto-side-stack">{data.trending.length > 0 && <section className="proto-panel"><div className="proto-panel-title">Trending</div><ol>{data.trending.map((story, index) => <li key={story.id}><b>{index+1}</b><Link href={story.href}>{story.title}</Link></li>)}</ol></section>}<div className="proto-ad-slot proto-ad-rectangle"><span>Advertisement</span><small>300 × 250 reserved</small></div></aside>
    </div>}

    {data.categoryRails.length > 0 && <section className="proto-section proto-category-rails"><div className="proto-section-head"><h2>Category rails</h2><div className="proto-section-rule" /></div>{data.categoryRails.map(({ category, stories }) => <div className="proto-rail" key={category.id}><div className="proto-rail-title"><h3>{category.name}</h3><Link href={`/${locale}/category/${category.slug}`}>View all →</Link></div><div className="proto-rail-grid">{stories.map((story) => <article key={story.id}><StoryImage story={story} className="proto-rail-image" /><div className="proto-label">{category.name}</div><h4><Link href={story.href}>{story.title}</Link></h4><p>{story.summary}</p></article>)}</div></div>)}</section>}

    {lowerEditorPicks.length > 0 && <section className="proto-section proto-editors"><div className="proto-section-head"><h2>Editor&apos;s picks</h2><div className="proto-section-rule" /></div><div className="proto-editors-grid"><article className="proto-editors-lead"><StoryImage story={lowerEditorPicks[0]} className="proto-photo" /><div className="proto-label">{lowerEditorPicks[0].categoryName}</div><h3><Link href={lowerEditorPicks[0].href}>{lowerEditorPicks[0].title}</Link></h3><p>{lowerEditorPicks[0].summary}</p></article><div className="proto-editors-list">{lowerEditorPicks.slice(1).map((story) => <article key={story.id}><div className="proto-label">{story.categoryName}</div><h3><Link href={story.href}>{story.title}</Link></h3></article>)}</div></div></section>}
  </div></main>;
}
