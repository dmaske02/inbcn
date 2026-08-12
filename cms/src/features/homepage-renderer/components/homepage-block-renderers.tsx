import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { HomepageCategoryRails, HomepageEditorsSection, HomepageFeedSection, HomepageHeadlineSection, HomepageHeroSection, HomepageRankedSection } from "@/features/news/components/homepage-sections";
import { LiveTvPlayer } from "@/features/live-tv/player/live-tv-player";
import type { LiveTvPageViewModel } from "@/features/live-tv/server/live-tv-page.model";
import { HomepageRendererError } from "../homepage-renderer.model";
import type { ResolvedHomepageSection } from "../homepage-renderer.types";
import { HeroSidebarRenderer } from "./hero-sidebar-renderer";

function requireKind<K extends ResolvedHomepageSection["data"]["kind"]>(section:ResolvedHomepageSection,kind:K):Extract<ResolvedHomepageSection["data"],{kind:K}> { if(section.data.kind!==kind) throw new HomepageRendererError("CONTRACT_FAILED",`Renderer data for ${section.type} is invalid.`,{blockId:section.blockId,blockType:section.type}); return section.data as Extract<ResolvedHomepageSection["data"],{kind:K}>; }
export function renderHeroStory(section:ResolvedHomepageSection,locale:string) { const {story}=requireKind(section,"story"); return <HomepageHeroSection locale={locale} story={story}/>; }
export function renderHeroSidebar(section:ResolvedHomepageSection,locale:string) { const {stories}=requireKind(section,"hero-sidebar"); return <HeroSidebarRenderer locale={locale} stories={stories} title={section.title}/>; }
export function renderBreakingNews(section:ResolvedHomepageSection) { return <HomepageHeadlineSection title={section.title} stories={requireKind(section,"stories").stories}/>; }
export function renderLatestNews(section:ResolvedHomepageSection,locale:string) { return <HomepageFeedSection locale={locale} title={section.title} stories={requireKind(section,"stories").stories}/>; }
export function renderCategorySection(section:ResolvedHomepageSection,locale:string) { const {category,stories}=requireKind(section,"category"); return <HomepageCategoryRails locale={locale} title={section.title} rails={[{category,stories}]}/>; }
export function renderTrending(section:ResolvedHomepageSection) { return <HomepageRankedSection title={section.title} stories={requireKind(section,"stories").stories}/>; }
export function renderOpinion(section:ResolvedHomepageSection) { return <HomepageEditorsSection title={section.title} stories={requireKind(section,"stories").stories}/>; }
export function renderAdvertisement(section:ResolvedHomepageSection) { return <AdvertisementPlaceholder label={requireKind(section,"placeholder").label}/>; }
export function renderCustomHtmlPlaceholder(section:ResolvedHomepageSection) { const data=requireKind(section,"placeholder"); return <section className="proto-section" aria-label={data.label}><div className="proto-ad-slot"><span>{data.label}</span><small>{data.detail}</small></div></section>; }
export function renderFuturePlaceholder(section:ResolvedHomepageSection) { const data=requireKind(section,"placeholder"); return <section className="proto-section" aria-label={data.label}><div className="proto-panel"><div className="proto-panel-title">{data.label}</div>{data.detail?<p>{data.detail}</p>:null}</div></section>; }
export function renderLiveTv(section:ResolvedHomepageSection) { const data=requireKind(section,"live-tv"); const view=data.view as LiveTvPageViewModel; if(view.mode!=="live"||!view.stream) return <section className="proto-section"><div className="proto-section-head"><h2>{section.title}</h2><div className="proto-section-rule"/></div><div className="proto-panel"><p>{view.offline.message}</p></div></section>; return <section className="proto-section"><div className="proto-section-head"><h2>{section.title}</h2><div className="proto-section-rule"/></div><LiveTvPlayer programme={view.stream} ariaLabel={view.labels.playerLabel??view.labels.pageTitle} liveLabel={view.labels.live} labels={view.labels.player}/></section>; }
