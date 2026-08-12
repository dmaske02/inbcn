import "server-only";

import { cache } from "react";
import { env } from "@/config/env";
import { buildHomepagePreview } from "@/features/homepage-builder/homepage-builder.preview";
import { getPublicHomepageConfiguration } from "@/features/homepage-builder/homepage-builder.repository";
import type { HomepageLocale, HomepageReferenceData } from "@/features/homepage-builder/homepage-builder.types";
import { getLiveTvPageData } from "@/features/live-tv/server/live-tv-page.service";
import { getHomepageData } from "@/features/news/server/services/homepage.service";
import { parseHomepageRendererPayload } from "./homepage-renderer.contract";
import { getHomepageRenderer } from "./homepage-renderer.registry";
import { resolveHomepageRendererPayload } from "./homepage-renderer.references";
import { HomepageRendererError } from "./homepage-renderer.model";
import {
  createHomepageRendererService,
  prepareHomepageBuilder,
  type HomepageRendererDependencies,
} from "./homepage-renderer.service-core";

const dependencies: HomepageRendererDependencies = {
  loadLegacy:getHomepageData,
  loadConfiguration:getPublicHomepageConfiguration,
  composePreview(configuration,legacy) {
    const references:HomepageReferenceData={
      stories:legacy.all.map((story)=>({id:story.id,languageId:configuration.configuration.languageId,title:story.title})),
      categories:legacy.categoryRails.map((rail)=>({id:rail.category.id,languageId:configuration.configuration.languageId,name:rail.category.name})),
      liveTv:{id:"localized-live-tv",languageId:configuration.configuration.languageId,title:"Live TV"},
    };
    return buildHomepagePreview(configuration.configuration.locale,configuration.sections,references);
  },
  resolvePayload:resolveHomepageRendererPayload,
  loadLiveTv:getLiveTvPageData,
  validatePayload:parseHomepageRendererPayload,
  renderSection(section,locale) {
    const registration=getHomepageRenderer(section.renderer);
    if(!registration||registration.type!==section.type)throw new HomepageRendererError("RENDERER_MISSING","No renderer is registered for this block.",{blockId:section.blockId,blockType:section.type});
    return registration.render(section,locale);
  },
  log(diagnostic) { console.warn("[homepage-builder]",JSON.stringify(diagnostic)); },
};

const service = createHomepageRendererService(dependencies);

export const preparePersistedHomepageBuilder = cache(async (locale: HomepageLocale) => {
  const legacy = await getHomepageData(locale);
  return prepareHomepageBuilder(locale, legacy, dependencies);
});

export const getRenderedHomepage=cache((locale:HomepageLocale)=>service(locale,env.server.homepageBuilder.enabled));
