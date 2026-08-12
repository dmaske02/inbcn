import type { HomepageSectionDto } from "../homepage-builder.types.ts";
import type {
  HomepageEditorDraft,
  HomepageEditorEvent,
  HomepageEditorSaveState,
  HomepageEditorState,
  HomepageEditorViewport,
} from "./homepage-editor.types.ts";
import { draftFromSection } from "./homepage-editor.validation.ts";

const INITIAL_SAVE_STATE: HomepageEditorSaveState = {
  status: "idle",
  requestSequence: 0,
  savedDraftRevision: 0,
};

function ordered(sections: readonly HomepageSectionDto[]): HomepageSectionDto[] {
  return [...sections].sort((left, right) => left.position - right.position);
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function withoutValue(values: readonly string[], value: string): string[] {
  return values.filter((item) => item !== value);
}

function addUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function initialState(
  sections: readonly HomepageSectionDto[],
  selectedSectionId: string | null | undefined,
  viewport: HomepageEditorViewport,
): HomepageEditorState {
  const baseSections = ordered(sections);
  const draftsBySectionId: Record<string, HomepageEditorDraft> = {};
  const saveStateById: Record<string, HomepageEditorSaveState> = {};
  const draftRevisionById: Record<string, number> = {};

  for (const section of baseSections) {
    draftsBySectionId[section.id] = draftFromSection(section);
    saveStateById[section.id] = INITIAL_SAVE_STATE;
    draftRevisionById[section.id] = 0;
  }

  const requestedSelection = selectedSectionId ?? baseSections[0]?.id ?? null;
  const selectionExists = requestedSelection === null || baseSections.some((item) => item.id === requestedSelection);

  return {
    baseSections,
    draftsBySectionId,
    selectedSectionId: selectionExists ? requestedSelection : (baseSections[0]?.id ?? null),
    newSectionDraft: null,
    orderedIds: baseSections.map((item) => item.id),
    dirtySectionIds: [],
    validationById: {},
    saveStateById,
    draftRevisionById,
    previewRevision: 0,
    viewport,
    pendingDeleteId: null,
    structuralRollback: null,
  };
}

export function createHomepageEditorState(
  sections: readonly HomepageSectionDto[],
  selectedSectionId?: string | null,
): HomepageEditorState {
  return initialState(sections, selectedSectionId, "desktop");
}

function replaceSection(
  sections: readonly HomepageSectionDto[],
  replacement: HomepageSectionDto,
): HomepageSectionDto[] {
  return ordered(sections.map((section) => (section.id === replacement.id ? replacement : section)));
}

export function homepageEditorReducer(
  state: HomepageEditorState,
  event: HomepageEditorEvent,
): HomepageEditorState {
  switch (event.type) {
    case "initialize":
      return initialState(event.sections, event.selectedSectionId, "desktop");
    case "locale-changed":
      return initialState(event.sections, event.selectedSectionId, state.viewport);
    case "select":
      if (event.sectionId !== null && !state.draftsBySectionId[event.sectionId]) return state;
      return { ...state, selectedSectionId: event.sectionId };
    case "new-section-started":
      return { ...state, newSectionDraft: event.draft };
    case "new-section-changed":
      return state.newSectionDraft
        ? { ...state, newSectionDraft: event.draft }
        : state;
    case "new-section-cancelled":
      return { ...state, newSectionDraft: null };
    case "new-section-succeeded": {
      const baseSections = ordered([...state.baseSections, event.section]);
      return {
        ...state,
        baseSections,
        draftsBySectionId: {
          ...state.draftsBySectionId,
          [event.section.id]: draftFromSection(event.section),
        },
        selectedSectionId: event.section.id,
        newSectionDraft: null,
        orderedIds: baseSections.map((item) => item.id),
        saveStateById: {
          ...state.saveStateById,
          [event.section.id]: { ...INITIAL_SAVE_STATE, status: "saved" },
        },
        draftRevisionById: { ...state.draftRevisionById, [event.section.id]: 0 },
        previewRevision: state.previewRevision + 1,
      };
    }
    case "edit-field": {
      if (!state.draftsBySectionId[event.sectionId]) return state;
      const currentSaveState = state.saveStateById[event.sectionId] ?? INITIAL_SAVE_STATE;
      return {
        ...state,
        draftsBySectionId: { ...state.draftsBySectionId, [event.sectionId]: event.draft },
        dirtySectionIds: addUnique(state.dirtySectionIds, event.sectionId),
        draftRevisionById: {
          ...state.draftRevisionById,
          [event.sectionId]: (state.draftRevisionById[event.sectionId] ?? 0) + 1,
        },
        saveStateById: {
          ...state.saveStateById,
          [event.sectionId]: {
            status: "dirty",
            requestSequence: currentSaveState.requestSequence,
            savedDraftRevision: currentSaveState.savedDraftRevision,
          },
        },
      };
    }
    case "validation-set":
      if (!state.draftsBySectionId[event.sectionId]) return state;
      return {
        ...state,
        validationById: { ...state.validationById, [event.sectionId]: event.errors },
      };
    case "save-started": {
      const current = state.saveStateById[event.sectionId];
      if (!current) return state;
      return {
        ...state,
        saveStateById: {
          ...state.saveStateById,
          [event.sectionId]: {
            status: "saving",
            requestSequence: event.requestSequence,
            savedDraftRevision: current.savedDraftRevision,
          },
        },
      };
    }
    case "save-failed": {
      const current = state.saveStateById[event.sectionId];
      if (!current || current.requestSequence !== event.requestSequence) return state;
      return {
        ...state,
        saveStateById: {
          ...state.saveStateById,
          [event.sectionId]: {
            status: event.code === "CONFLICT" ? "conflict" : "error",
            requestSequence: event.requestSequence,
            savedDraftRevision: current.savedDraftRevision,
            message: event.message,
          },
        },
      };
    }
    case "save-succeeded": {
      const current = state.saveStateById[event.sectionId];
      if (!current || current.requestSequence !== event.requestSequence) return state;
      const currentDraftRevision = state.draftRevisionById[event.sectionId] ?? 0;
      const fullyAcknowledged = currentDraftRevision === event.savedDraftRevision;
      return {
        ...state,
        baseSections: replaceSection(state.baseSections, event.section),
        draftsBySectionId: fullyAcknowledged
          ? { ...state.draftsBySectionId, [event.sectionId]: draftFromSection(event.section) }
          : state.draftsBySectionId,
        dirtySectionIds: fullyAcknowledged
          ? withoutValue(state.dirtySectionIds, event.sectionId)
          : state.dirtySectionIds,
        validationById: fullyAcknowledged
          ? withoutKey(state.validationById, event.sectionId)
          : state.validationById,
        saveStateById: {
          ...state.saveStateById,
          [event.sectionId]: {
            status: fullyAcknowledged ? "saved" : "dirty",
            requestSequence: event.requestSequence,
            savedDraftRevision: event.savedDraftRevision,
          },
        },
        previewRevision: state.previewRevision + 1,
      };
    }
    case "reorder-optimistic":
      return { ...state, orderedIds: [...event.orderedIds] };
    case "reorder-reverted":
      return { ...state, orderedIds: ordered(state.baseSections).map((item) => item.id) };
    case "reorder-succeeded": {
      const baseSections = ordered(event.sections);
      const confirmedIds = baseSections.map((item) => item.id);
      if (
        confirmedIds.length !== state.orderedIds.length
        || confirmedIds.some((id) => !state.draftsBySectionId[id])
        || new Set(confirmedIds).size !== confirmedIds.length
      ) return state;
      return {
        ...state,
        baseSections,
        orderedIds: confirmedIds,
        previewRevision: state.previewRevision + 1,
      };
    }
    case "duplicate-optimistic": {
      if (state.structuralRollback) return state;
      const source = state.baseSections.find((item) => item.id === event.sourceSectionId);
      if (!source || state.draftsBySectionId[event.temporaryId]) return state;
      const rollback = { ...state, pendingDeleteId: null, structuralRollback: null };
      const titleSuffix = " Copy";
      const title = `${source.title.slice(0, 180 - titleSuffix.length).trimEnd() || "Section"}${titleSuffix}`;
      const temporarySection: HomepageSectionDto = {
        ...source,
        id: event.temporaryId,
        blockId: event.temporaryId,
        title,
        position: source.position + 1,
      };
      const baseSections = ordered([
        ...state.baseSections.map((item) => item.position > source.position
          ? { ...item, position: item.position + 1 }
          : item),
        temporarySection,
      ]);
      return {
        ...state,
        baseSections,
        draftsBySectionId: {
          ...state.draftsBySectionId,
          [event.temporaryId]: draftFromSection(temporarySection),
        },
        selectedSectionId: event.temporaryId,
        orderedIds: baseSections.map((item) => item.id),
        saveStateById: {
          ...state.saveStateById,
          [event.temporaryId]: { ...INITIAL_SAVE_STATE, status: "saving" },
        },
        draftRevisionById: { ...state.draftRevisionById, [event.temporaryId]: 0 },
        pendingDeleteId: null,
        structuralRollback: rollback,
      };
    }
    case "duplicate-succeeded": {
      if (event.temporaryId && event.sections) {
        const baseSections = ordered(event.sections);
        const selectedSectionId = state.selectedSectionId === event.temporaryId
          ? event.section.id
          : state.selectedSectionId;
        return {
          ...state,
          baseSections,
          draftsBySectionId: {
            ...withoutKey(state.draftsBySectionId, event.temporaryId),
            [event.section.id]: draftFromSection(event.section),
          },
          orderedIds: baseSections.map((item) => item.id),
          selectedSectionId,
          saveStateById: {
            ...withoutKey(state.saveStateById, event.temporaryId),
            [event.section.id]: { ...INITIAL_SAVE_STATE, status: "saved" },
          },
          draftRevisionById: {
            ...withoutKey(state.draftRevisionById, event.temporaryId),
            [event.section.id]: 0,
          },
          validationById: withoutKey(state.validationById, event.temporaryId),
          structuralRollback: null,
          previewRevision: state.previewRevision + 1,
        };
      }
      const baseSections = ordered([...state.baseSections, event.section]);
      return {
        ...state,
        baseSections,
        draftsBySectionId: {
          ...state.draftsBySectionId,
          [event.section.id]: draftFromSection(event.section),
        },
        orderedIds: baseSections.map((item) => item.id),
        selectedSectionId: event.section.id,
        saveStateById: {
          ...state.saveStateById,
          [event.section.id]: { ...INITIAL_SAVE_STATE, status: "saved" },
        },
        draftRevisionById: { ...state.draftRevisionById, [event.section.id]: 0 },
        previewRevision: state.previewRevision + 1,
      };
    }
    case "structural-reverted":
      return state.structuralRollback ?? state;
    case "delete-requested":
      return state.draftsBySectionId[event.sectionId]
        ? { ...state, pendingDeleteId: event.sectionId }
        : state;
    case "delete-cancelled":
      return { ...state, pendingDeleteId: null };
    case "delete-optimistic": {
      if (state.structuralRollback) return state;
      const deletedIndex = state.orderedIds.indexOf(event.sectionId);
      if (deletedIndex < 0) return state;
      const rollback = { ...state, pendingDeleteId: null, structuralRollback: null };
      const orderedIds = withoutValue(state.orderedIds, event.sectionId);
      const selectedSectionId = state.selectedSectionId === event.sectionId
        ? (orderedIds[deletedIndex] ?? orderedIds[deletedIndex - 1] ?? null)
        : state.selectedSectionId;
      return {
        ...state,
        baseSections: state.baseSections.filter((item) => item.id !== event.sectionId),
        draftsBySectionId: withoutKey(state.draftsBySectionId, event.sectionId),
        selectedSectionId,
        orderedIds,
        dirtySectionIds: withoutValue(state.dirtySectionIds, event.sectionId),
        validationById: withoutKey(state.validationById, event.sectionId),
        saveStateById: withoutKey(state.saveStateById, event.sectionId),
        draftRevisionById: withoutKey(state.draftRevisionById, event.sectionId),
        pendingDeleteId: null,
        structuralRollback: rollback,
      };
    }
    case "delete-succeeded": {
      if (event.sections) {
        const baseSections = ordered(event.sections);
        return {
          ...state,
          baseSections,
          orderedIds: baseSections.map((item) => item.id),
          structuralRollback: null,
          previewRevision: state.previewRevision + 1,
        };
      }
      const deletedIndex = state.orderedIds.indexOf(event.sectionId);
      if (deletedIndex < 0) return state;
      const orderedIds = withoutValue(state.orderedIds, event.sectionId);
      const selectedSectionId = state.selectedSectionId === event.sectionId
        ? (orderedIds[deletedIndex] ?? orderedIds[deletedIndex - 1] ?? null)
        : state.selectedSectionId;
      return {
        ...state,
        baseSections: state.baseSections.filter((item) => item.id !== event.sectionId),
        draftsBySectionId: withoutKey(state.draftsBySectionId, event.sectionId),
        selectedSectionId,
        orderedIds,
        dirtySectionIds: withoutValue(state.dirtySectionIds, event.sectionId),
        validationById: withoutKey(state.validationById, event.sectionId),
        saveStateById: withoutKey(state.saveStateById, event.sectionId),
        draftRevisionById: withoutKey(state.draftRevisionById, event.sectionId),
        previewRevision: state.previewRevision + 1,
        pendingDeleteId: null,
        structuralRollback: null,
      };
    }
    case "viewport-changed":
      return { ...state, viewport: event.viewport };
  }
}
