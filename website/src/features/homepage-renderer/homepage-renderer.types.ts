import type { ReactNode } from "react";
import type { HomepageLocale, HomepageContainer, HomepageWidth } from "@/features/homepage-builder/homepage-builder.types";
import type { HomepageStory, HomepageViewModel } from "@/features/news/server/services/homepage.service";

export const HOMEPAGE_RENDERER_PAIRS = {
  "hero-story":"hero-story", "hero-sidebar":"hero-sidebar", "breaking-news":"breaking-news", "live-tv":"live-tv", "latest-news":"latest-news", "category-section":"category-section", trending:"trending", opinion:"opinion", "advertisement-placeholder":"advertisement-placeholder", "custom-html-placeholder":"custom-html-disabled", "future-placeholder":"future-placeholder",
} as const;
export type HomepageBlockType = keyof typeof HOMEPAGE_RENDERER_PAIRS;
export type HomepageRendererId = (typeof HOMEPAGE_RENDERER_PAIRS)[HomepageBlockType];
export type HomepageRendererData =
  | Readonly<{ kind:"story"; story: HomepageStory }>
  | Readonly<{ kind:"hero-sidebar"; stories: readonly HomepageStory[] }>
  | Readonly<{ kind:"stories"; stories: readonly HomepageStory[] }>
  | Readonly<{ kind:"category"; category: Readonly<{ id:string; name:string; slug:string }>; stories: readonly HomepageStory[] }>
  | Readonly<{ kind:"live-tv"; view: unknown }>
  | Readonly<{ kind:"placeholder"; label:string; detail?:string }>;
export type ResolvedHomepageSection = Readonly<{ id:string; blockId:string; title:string; type:HomepageBlockType; renderer:HomepageRendererId; position:number; container:HomepageContainer; width:HomepageWidth; data:HomepageRendererData }>;
export type HomepageRendererPayload = Readonly<{ locale:HomepageLocale; sections:readonly ResolvedHomepageSection[] }>;
export type PreparedHomepageSection = Readonly<{ id:string; type:HomepageBlockType; position:number; container:HomepageContainer; width:HomepageWidth; node:ReactNode }>;
export type HomepageRenderResult = Readonly<{ kind:"legacy"; locale:HomepageLocale; legacy:HomepageViewModel }> | Readonly<{ kind:"builder"; locale:HomepageLocale; legacy:HomepageViewModel; sections:readonly PreparedHomepageSection[] }>;
export type HomepageRendererFailureCode = "CONFIGURATION_MISSING"|"EMPTY_CONFIGURATION"|"REPOSITORY_FAILED"|"PREVIEW_FAILED"|"REFERENCE_FAILED"|"CONTRACT_FAILED"|"RENDERER_MISSING"|"RENDERER_FAILED"|"LIVE_TV_FAILED"|"UNEXPECTED";
export type HomepageRendererDiagnostic = Readonly<{ locale:HomepageLocale; code:HomepageRendererFailureCode; message:string; blockId?:string; blockType?:string }>;
