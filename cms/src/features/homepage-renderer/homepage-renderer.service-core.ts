import type { ReactNode } from "react";
import type {
  HomepageLocale,
  HomepagePreviewPayload,
  HomepageSectionDto,
} from "@/features/homepage-builder/homepage-builder.types";
import type { HomepageViewModel } from "@/features/news/server/services/homepage.service";
import { diagnosticFromError, HomepageRendererError } from "./homepage-renderer.model.ts";
import type {
  HomepageRenderResult,
  HomepageRendererDiagnostic,
  HomepageRendererPayload,
  PreparedHomepageSection,
  ResolvedHomepageSection,
} from "./homepage-renderer.types.ts";

type PublicConfiguration = Readonly<{
  configuration: Readonly<{ id: string; languageId: string; locale: HomepageLocale }>;
  sections: readonly HomepageSectionDto[];
}>;

export type HomepageRendererDependencies = Readonly<{
  loadLegacy(locale: HomepageLocale): Promise<HomepageViewModel>;
  loadConfiguration(locale: HomepageLocale): Promise<PublicConfiguration | null>;
  composePreview(
    configuration: PublicConfiguration,
    legacy: HomepageViewModel,
  ): HomepagePreviewPayload;
  resolvePayload(
    locale: HomepageLocale,
    preview: HomepagePreviewPayload,
    legacy: HomepageViewModel,
    liveTv: unknown | null,
  ): HomepageRendererPayload;
  loadLiveTv(locale: HomepageLocale): Promise<unknown>;
  validatePayload(payload: unknown): HomepageRendererPayload;
  renderSection(section: ResolvedHomepageSection, locale: HomepageLocale): ReactNode;
  log(diagnostic: HomepageRendererDiagnostic): void;
}>;

export async function prepareHomepageBuilder(
  locale: HomepageLocale,
  legacy: HomepageViewModel,
  dependencies: HomepageRendererDependencies,
): Promise<readonly PreparedHomepageSection[]> {
  let configuration: PublicConfiguration | null;
  try {
    configuration = await dependencies.loadConfiguration(locale);
  } catch {
    throw new HomepageRendererError(
      "REPOSITORY_FAILED",
      "Homepage Builder persistence is unavailable.",
    );
  }
  if (!configuration) {
    throw new HomepageRendererError(
      "CONFIGURATION_MISSING",
      "No Homepage Builder configuration exists.",
    );
  }

  for (const section of configuration.sections) {
    const start = section.startsAt ? Date.parse(section.startsAt) : null;
    const end = section.endsAt ? Date.parse(section.endsAt) : null;
    if (
      (start !== null && !Number.isFinite(start))
      || (end !== null && !Number.isFinite(end))
      || (end !== null && (start === null || end <= start))
    ) {
      throw new HomepageRendererError(
        "PREVIEW_FAILED",
        "A Homepage Builder schedule is invalid.",
        { blockId: section.blockId, blockType: section.blockType },
      );
    }
  }

  let preview: HomepagePreviewPayload;
  try {
    preview = dependencies.composePreview(configuration, legacy);
  } catch (error) {
    if (error instanceof HomepageRendererError) throw error;
    throw new HomepageRendererError(
      "PREVIEW_FAILED",
      "Homepage Builder preview composition failed.",
    );
  }
  if (!preview.sections.length) {
    throw new HomepageRendererError(
      "EMPTY_CONFIGURATION",
      "No active Homepage Builder sections exist.",
    );
  }

  const needsLiveTv = preview.sections.some((section) => section.type === "live-tv");
  let liveTv: unknown | null = null;
  if (needsLiveTv) {
    try {
      liveTv = await dependencies.loadLiveTv(locale);
    } catch {
      throw new HomepageRendererError(
        "LIVE_TV_FAILED",
        "The localized Live TV experience is unavailable.",
      );
    }
  }

  let resolved: HomepageRendererPayload;
  try {
    resolved = dependencies.resolvePayload(locale, preview, legacy, liveTv);
  } catch (error) {
    if (error instanceof HomepageRendererError) throw error;
    throw new HomepageRendererError(
      "REFERENCE_FAILED",
      "Homepage Builder references could not be resolved.",
    );
  }

  let payload: HomepageRendererPayload;
  try {
    payload = dependencies.validatePayload(resolved);
  } catch {
    throw new HomepageRendererError(
      "CONTRACT_FAILED",
      "Homepage Builder output validation failed.",
    );
  }

  return payload.sections.map((section) => {
    try {
      return {
        id: section.id,
        type: section.type,
        position: section.position,
        container: section.container,
        width: section.width,
        node: dependencies.renderSection(section, locale),
      };
    } catch (error) {
      if (error instanceof HomepageRendererError) throw error;
      throw new HomepageRendererError(
        "RENDERER_FAILED",
        "A Homepage Builder renderer failed.",
        { blockId: section.blockId, blockType: section.type },
      );
    }
  });
}

export function createHomepageRendererService(dependencies: HomepageRendererDependencies) {
  return async function renderHomepage(
    locale: HomepageLocale,
    enabled: boolean,
  ): Promise<HomepageRenderResult> {
    const legacy = await dependencies.loadLegacy(locale);
    if (!enabled) return { kind: "legacy", locale, legacy };

    try {
      const sections = await prepareHomepageBuilder(locale, legacy, dependencies);
      return { kind: "builder", locale, legacy, sections };
    } catch (error) {
      dependencies.log(diagnosticFromError(locale, error));
      return { kind: "legacy", locale, legacy };
    }
  };
}
