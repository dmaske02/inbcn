import type { HomepagePreviewPayload } from "@/features/homepage-builder/homepage-builder.types";
import type { HomepageLocale } from "@/features/homepage-builder/homepage-builder.types";
import type { HomepageStory, HomepageViewModel } from "@/features/news/server/services/homepage.service";
import { HomepageRendererError } from "./homepage-renderer.model.ts";
import type { HomepageRendererData, HomepageRendererPayload, ResolvedHomepageSection } from "./homepage-renderer.types.ts";

function object(value:unknown):Record<string,unknown> { return value && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
function limit(configuration:Record<string,unknown>,fallback:number) { return typeof configuration.limit==="number" ? configuration.limit : fallback; }
function localeStories(locale:HomepageLocale,stories:readonly HomepageStory[]) { if(stories.some((story)=>!story.href.startsWith(`/${locale}/`))) throw new HomepageRendererError("REFERENCE_FAILED","A story belongs to another locale."); return stories; }

export function resolveHomepageRendererPayload(locale:HomepageLocale,preview:HomepagePreviewPayload,legacy:HomepageViewModel,liveTvView:unknown|null):HomepageRendererPayload {
  if(preview.locale!==locale) throw new HomepageRendererError("REFERENCE_FAILED","The preview belongs to another locale.");
  localeStories(locale,legacy.all);
  const sections=preview.sections.map<ResolvedHomepageSection>((section,index)=>{
    const configuration=object(section.configuration); let data:HomepageRendererData;
    switch(section.type) {
      case "hero-story": { const story=legacy.all.find((item)=>item.id===configuration.storyId); if(!story) throw new HomepageRendererError("REFERENCE_FAILED","The configured story could not be resolved.",{blockId:section.blockId,blockType:section.type}); data={kind:"story",story}; break; }
      case "hero-sidebar": { const storyIds=Array.isArray(configuration.storyIds)?configuration.storyIds.filter((item):item is string=>typeof item==="string"):[]; const previous=preview.sections[index-1]; const previousConfiguration=previous?.configuration&&typeof previous.configuration==="object"&&!Array.isArray(previous.configuration)?previous.configuration as Record<string,unknown>:{}; const adjacentHeroStoryId=previous?.type==="hero-story"&&typeof previousConfiguration.storyId==="string"?previousConfiguration.storyId:null; const storiesById=new Map(legacy.all.map((story)=>[story.id,story])); data={kind:"hero-sidebar",stories:storyIds.flatMap((storyId)=>{if(storyId===adjacentHeroStoryId)return [];const story=storiesById.get(storyId);return story?[story]:[];})}; break; }
      case "breaking-news": data={kind:"stories",stories:legacy.breaking.slice(0,limit(configuration,10))}; break;
      case "latest-news": data={kind:"stories",stories:legacy.latest.slice(0,limit(configuration,12))}; break;
      case "trending": data={kind:"stories",stories:legacy.trending.slice(0,limit(configuration,8))}; break;
      case "opinion": data={kind:"stories",stories:legacy.editorPicks.slice(0,limit(configuration,6))}; break;
      case "category-section": { const categoryId=configuration.categoryId; const stories=typeof categoryId==="string"?legacy.all.filter((item)=>item.categoryId===categoryId):[]; const representative=stories[0]; if(!representative||representative.categoryName===null||representative.categorySlug===null) throw new HomepageRendererError("REFERENCE_FAILED","The configured category could not be resolved.",{blockId:section.blockId,blockType:section.type}); data={kind:"category",category:{id:categoryId as string,name:representative.categoryName,slug:representative.categorySlug},stories:stories.slice(0,limit(configuration,8))}; break; }
      case "live-tv": if(liveTvView===null) throw new HomepageRendererError("LIVE_TV_FAILED","The localized Live TV configuration could not be resolved.",{blockId:section.blockId,blockType:section.type}); else data={kind:"live-tv",view:liveTvView}; break;
      case "advertisement-placeholder": data={kind:"placeholder",label:typeof configuration.label==="string"?configuration.label:"Advertisement"}; break;
      case "custom-html-placeholder": data={kind:"placeholder",label:"Custom content placeholder",detail:"Custom HTML is disabled on the public homepage."}; break;
      case "future-placeholder": data={kind:"placeholder",label:"Future content placeholder",detail:typeof configuration.note==="string"?configuration.note:""}; break;
      default: throw new HomepageRendererError("RENDERER_MISSING","The block type is unsupported.",{blockId:section.blockId,blockType:section.type});
    }
    return {id:section.id,blockId:section.blockId,title:section.title,type:section.type as ResolvedHomepageSection["type"],renderer:section.renderer as ResolvedHomepageSection["renderer"],position:section.position,container:section.container,width:section.width,data};
  });
  return {locale,sections};
}
