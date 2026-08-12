import type {
  HomepageContainer,
  HomepageSectionDto,
  HomepageSectionInput,
  HomepageWidth,
} from "../homepage-builder.types.ts";

export type HomepageEditorViewport = "desktop" | "tablet" | "mobile";
export type HomepageEditorSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
export type HomepageEditorErrorCode =
  | "VALIDATION"
  | "REFERENCE_MISSING"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ORDERING"
  | "PERSISTENCE";

type HomepageEditorDraftBase<TBlockType extends string> = Readonly<{
  id: string;
  blockId: string;
  title: string;
  blockType: TBlockType;
  container: HomepageContainer;
  width: HomepageWidth;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}>;

type ListBlockType = "breaking-news" | "latest-news" | "trending" | "opinion";

export type HomepageEditorDraft =
  | (HomepageEditorDraftBase<"hero-story"> & Readonly<{ storyId: string }>)
  | (HomepageEditorDraftBase<"hero-sidebar"> & Readonly<{ storyIds: readonly string[] }>)
  | (HomepageEditorDraftBase<ListBlockType> & Readonly<{ limit: number }>)
  | HomepageEditorDraftBase<"live-tv">
  | (HomepageEditorDraftBase<"category-section"> & Readonly<{ categoryId: string; limit: number }>)
  | (HomepageEditorDraftBase<"advertisement-placeholder"> & Readonly<{ label: string }>)
  | (HomepageEditorDraftBase<"custom-html-placeholder"> & Readonly<{ content: string }>)
  | (HomepageEditorDraftBase<"future-placeholder"> & Readonly<{ note: string }>);

export type HomepageEditorFieldErrors = Readonly<Record<string, string>>;

export type HomepageEditorSaveState = Readonly<{
  status: HomepageEditorSaveStatus;
  requestSequence: number;
  savedDraftRevision: number;
  message?: string;
}>;

export type HomepageEditorState = Readonly<{
  baseSections: readonly HomepageSectionDto[];
  draftsBySectionId: Readonly<Record<string, HomepageEditorDraft>>;
  selectedSectionId: string | null;
  newSectionDraft: HomepageEditorDraft | null;
  orderedIds: readonly string[];
  dirtySectionIds: readonly string[];
  validationById: Readonly<Record<string, HomepageEditorFieldErrors>>;
  saveStateById: Readonly<Record<string, HomepageEditorSaveState>>;
  draftRevisionById: Readonly<Record<string, number>>;
  previewRevision: number;
  viewport: HomepageEditorViewport;
  pendingDeleteId: string | null;
  structuralRollback: HomepageEditorState | null;
}>;

export type HomepageEditorEvent =
  | Readonly<{ type: "initialize"; sections: readonly HomepageSectionDto[]; selectedSectionId?: string | null }>
  | Readonly<{ type: "select"; sectionId: string | null }>
  | Readonly<{ type: "new-section-started"; draft: HomepageEditorDraft }>
  | Readonly<{ type: "new-section-changed"; draft: HomepageEditorDraft }>
  | Readonly<{ type: "new-section-cancelled" }>
  | Readonly<{ type: "new-section-succeeded"; section: HomepageSectionDto }>
  | Readonly<{ type: "edit-field"; sectionId: string; draft: HomepageEditorDraft }>
  | Readonly<{ type: "validation-set"; sectionId: string; errors: HomepageEditorFieldErrors }>
  | Readonly<{ type: "save-started"; sectionId: string; requestSequence: number; draftRevision: number }>
  | Readonly<{
      type: "save-succeeded";
      sectionId: string;
      requestSequence: number;
      savedDraftRevision: number;
      section: HomepageSectionDto;
    }>
  | Readonly<{
      type: "save-failed";
      sectionId: string;
      requestSequence: number;
      code: HomepageEditorErrorCode;
      message: string;
    }>
  | Readonly<{ type: "reorder-optimistic"; orderedIds: readonly string[] }>
  | Readonly<{ type: "reorder-reverted" }>
  | Readonly<{ type: "reorder-succeeded"; sections: readonly HomepageSectionDto[] }>
  | Readonly<{ type: "duplicate-optimistic"; sourceSectionId: string; temporaryId: string }>
  | Readonly<{
      type: "duplicate-succeeded";
      section: HomepageSectionDto;
      temporaryId?: string;
      sections?: readonly HomepageSectionDto[];
    }>
  | Readonly<{ type: "structural-reverted" }>
  | Readonly<{ type: "delete-requested"; sectionId: string }>
  | Readonly<{ type: "delete-cancelled" }>
  | Readonly<{ type: "delete-optimistic"; sectionId: string }>
  | Readonly<{ type: "delete-succeeded"; sectionId: string; sections?: readonly HomepageSectionDto[] }>
  | Readonly<{ type: "viewport-changed"; viewport: HomepageEditorViewport }>
  | Readonly<{ type: "locale-changed"; sections: readonly HomepageSectionDto[]; selectedSectionId?: string | null }>;

export type EditorActionResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{
      ok: false;
      code: HomepageEditorErrorCode;
      message: string;
      fieldErrors?: HomepageEditorFieldErrors;
    }>;

export type HomepageEditorRegistryDefinition = Readonly<{
  id: string;
  renderer: string;
  validate(value: unknown): Readonly<{ success: boolean }>;
}>;

export type HomepageEditorMappedInput = HomepageSectionInput;
