import "server-only";

import { cache } from "react";
import type { AdminIdentity } from "../../admin/auth/authorization.model";
import {
  diagnosticFromError,
} from "../../homepage-renderer/homepage-renderer.model.ts";
import type {
  HomepageRendererDiagnostic,
  HomepageRendererFailureCode,
  PreparedHomepageSection,
} from "../../homepage-renderer/homepage-renderer.types.ts";
import type { HomepageLocale } from "../homepage-builder.types.ts";

export type HomepageEditorPreviewResult =
  | Readonly<{
      kind: "ready";
      locale: HomepageLocale;
      sections: readonly PreparedHomepageSection[];
    }>
  | Readonly<{
      kind: "error";
      locale: HomepageLocale;
      error: Readonly<{
        code: HomepageRendererFailureCode;
        message: string;
        blockType?: string;
      }>;
    }>;

type Dependencies = Readonly<{
  prepare(locale: HomepageLocale): Promise<readonly PreparedHomepageSection[]>;
  log(diagnostic: HomepageRendererDiagnostic): void;
}>;

function editorMessage(code: HomepageRendererFailureCode): string {
  switch (code) {
    case "CONFIGURATION_MISSING":
      return "No Homepage Builder configuration exists for this language.";
    case "EMPTY_CONFIGURATION":
      return "No homepage sections are currently active for this language.";
    case "REFERENCE_FAILED":
      return "The preview could not resolve all required homepage content.";
    case "LIVE_TV_FAILED":
      return "The Live TV section is temporarily unavailable in the preview.";
    case "PREVIEW_FAILED":
    case "CONTRACT_FAILED":
    case "RENDERER_MISSING":
    case "RENDERER_FAILED":
      return "The saved homepage configuration could not be rendered.";
    case "REPOSITORY_FAILED":
    case "UNEXPECTED":
      return "The homepage preview is temporarily unavailable.";
  }
}

export function createHomepageEditorPreviewService(dependencies: Dependencies) {
  return async function renderPreview(
    locale: HomepageLocale,
    admin: AdminIdentity,
  ): Promise<HomepageEditorPreviewResult> {
    void admin;
    try {
      const sections = await dependencies.prepare(locale);
      return { kind: "ready", locale, sections };
    } catch (error) {
      const diagnostic = diagnosticFromError(locale, error);
      dependencies.log(diagnostic);
      return {
        kind: "error",
        locale,
        error: {
          code: diagnostic.code,
          message: editorMessage(diagnostic.code),
          ...(diagnostic.blockType ? { blockType: diagnostic.blockType } : {}),
        },
      };
    }
  };
}

const productionService = createHomepageEditorPreviewService({
  async prepare(locale) {
    const { preparePersistedHomepageBuilder } = await import(
      "../../homepage-renderer/homepage-renderer.service"
    );
    return preparePersistedHomepageBuilder(locale);
  },
  log(diagnostic) {
    console.warn("[homepage-builder-preview]", JSON.stringify(diagnostic));
  },
});

export const renderHomepageEditorPreview = cache(productionService);
