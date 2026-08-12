import type { ReactNode } from "react";
import { renderAdvertisement, renderBreakingNews, renderCategorySection, renderCustomHtmlPlaceholder, renderFuturePlaceholder, renderHeroSidebar, renderHeroStory, renderLatestNews, renderLiveTv, renderOpinion, renderTrending } from "./components/homepage-block-renderers";
import type { HomepageBlockType, HomepageRendererId, ResolvedHomepageSection } from "./homepage-renderer.types";

type Renderer=(section:ResolvedHomepageSection,locale:string)=>ReactNode;
export type HomepageRendererRegistration=Readonly<{id:HomepageRendererId;type:HomepageBlockType;render:Renderer}>;
export const HOMEPAGE_RENDERER_REGISTRY:readonly HomepageRendererRegistration[]=[
  {id:"hero-story",type:"hero-story",render:renderHeroStory},{id:"hero-sidebar",type:"hero-sidebar",render:renderHeroSidebar},{id:"breaking-news",type:"breaking-news",render:renderBreakingNews},{id:"live-tv",type:"live-tv",render:renderLiveTv},{id:"latest-news",type:"latest-news",render:renderLatestNews},{id:"category-section",type:"category-section",render:renderCategorySection},{id:"trending",type:"trending",render:renderTrending},{id:"opinion",type:"opinion",render:renderOpinion},{id:"advertisement-placeholder",type:"advertisement-placeholder",render:renderAdvertisement},{id:"custom-html-disabled",type:"custom-html-placeholder",render:renderCustomHtmlPlaceholder},{id:"future-placeholder",type:"future-placeholder",render:renderFuturePlaceholder},
];
export function getHomepageRenderer(id:string) { return HOMEPAGE_RENDERER_REGISTRY.find((item)=>item.id===id)??null; }
