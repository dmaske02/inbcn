"use client";

import { useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  createHomepageEditorState,
  homepageEditorReducer,
} from "../../editor/homepage-editor.reducer";
import type { HomepageEditorDraft } from "../../editor/homepage-editor.types";
import { validateHomepageEditorDraft } from "../../editor/homepage-editor.validation";
import { useHomepageAutosave } from "../../editor/use-homepage-autosave";
import { useUnsavedChangesGuard } from "../../editor/use-unsaved-changes-guard";
import { saveVisualHomepageSection } from "../../homepage-builder.actions";
import { getHomepageBlockDefinition } from "../../homepage-builder.registry";
import type { HomepageLocale, HomepageSectionDto } from "../../homepage-builder.types";
import { AddHomepageSectionDialog } from "./add-homepage-section-dialog";
import { HomepageBuilderToolbar } from "./homepage-builder-toolbar";
import { HomepageInspector } from "./homepage-inspector";
import { HomepagePreviewFrame } from "./homepage-preview-frame";
import { SectionList } from "../sections/section-list";

export function HomepageBuilderWorkspace({
  locale,
  sections,
  canManage,
}: Readonly<{
  locale: HomepageLocale;
  sections: readonly HomepageSectionDto[];
  canManage: boolean;
}>) {
  const [state, dispatch] = useReducer(homepageEditorReducer, sections, createHomepageEditorState);
  const [announcement, setAnnouncement] = useState("");
  const { retry, savedAtById } = useHomepageAutosave({
    locale,
    state,
    dispatch,
    save: saveVisualHomepageSection,
  });
  const saveStates = Object.values(state.saveStateById);
  useUnsavedChangesGuard([
    ...saveStates.map((item) => item.status),
    state.structuralRollback ? "saving" : "idle",
  ]);

  const selectedId = state.selectedSectionId;
  const selectedDraft = selectedId ? state.draftsBySectionId[selectedId] ?? null : null;
  const selectedSaveState = selectedId ? state.saveStateById[selectedId] : undefined;
  const orderingDisabled = !canManage || saveStates.some((item) => item.status === "dirty" || item.status === "saving");

  function updateDraft(draft: HomepageEditorDraft) {
    const definition = getHomepageBlockDefinition(draft.blockType);
    const errors = definition
      ? validateHomepageEditorDraft(draft, definition)
      : { blockType: "This section type is not supported." };
    dispatch({ type: "edit-field", sectionId: draft.id, draft });
    dispatch({ type: "validation-set", sectionId: draft.id, errors });
  }

  return (
    <div className="grid gap-6">
      <HomepageBuilderToolbar
        addSectionControl={canManage ? (
          <AddHomepageSectionDialog
            draft={state.newSectionDraft}
            locale={locale}
            onCancel={() => dispatch({ type: "new-section-cancelled" })}
            onCreated={(section) => {
              dispatch({ type: "new-section-succeeded", section });
              setAnnouncement(`Section added: ${section.title}.`);
            }}
            onDraftChange={(draft) => dispatch({ type: "new-section-changed", draft })}
            onStart={(draft) => dispatch({ type: "new-section-started", draft })}
          />
        ) : undefined}
        locale={locale}
        saveStates={saveStates}
        savedAtById={savedAtById}
      />
      {!canManage ? (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Read-only access</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Writers can review each localized homepage and its preview. An editor or administrator is required to make changes.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,0.65fr)_minmax(22rem,1.35fr)]">
        <section aria-labelledby="homepage-sections-heading">
          <h2 className="mb-3 text-lg font-semibold" id="homepage-sections-heading">Sections</h2>
          <SectionList
            canManage={canManage}
            disabled={orderingDisabled}
            dispatch={dispatch}
            draftsBySectionId={state.draftsBySectionId}
            locale={locale}
            orderedIds={state.orderedIds}
            saveStateById={state.saveStateById}
            selectedSectionId={selectedId}
            sections={state.baseSections}
            pendingDeleteId={state.pendingDeleteId}
          />
        </section>
        <section aria-label="Section inspector">
          {canManage ? (
            <>
              <HomepageInspector
                draft={selectedDraft}
                fieldErrors={selectedId ? state.validationById[selectedId] ?? {} : {}}
                locale={locale}
                onChange={updateDraft}
              />
              {selectedId && selectedSaveState?.status === "error" ? (
                <Button className="mt-3" onClick={() => retry(selectedId)} variant="outline">
                  Retry save
                </Button>
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">Select a section to review it in the persisted homepage preview.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
      <HomepagePreviewFrame
        dispatch={dispatch}
        locale={locale}
        revision={state.previewRevision}
        viewport={state.viewport}
      />
      <p aria-live="polite" className="sr-only" role="status">{announcement}</p>
    </div>
  );
}
