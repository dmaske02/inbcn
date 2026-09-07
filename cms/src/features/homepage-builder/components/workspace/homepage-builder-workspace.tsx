"use client";

import { useReducer, useState } from "react";
import { Layers3, SlidersHorizontal, X } from "lucide-react";
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
import { createVisualHomepageSection, saveVisualHomepageSection } from "../../homepage-builder.actions";
import { getHomepageBlockDefinition } from "../../homepage-builder.registry";
import type { HomepageLocale, HomepageSectionDto } from "../../homepage-builder.types";
import { HomepageBuilderToolbar } from "./homepage-builder-toolbar";
import { HomepageInspector } from "./homepage-inspector";
import { HomepagePreviewFrame } from "./homepage-preview-frame";
import { FixedHomepageSectionList } from "../sections/fixed-homepage-section-list";
import { getFixedHomepageTemplate, isFixedHomepageSelectionId } from "../../homepage-fixed-template.model";

async function persistHomepageSection(input: unknown) {
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (typeof record.id === "string" && isFixedHomepageSelectionId(record.id)) {
      return createVisualHomepageSection({ locale: record.locale, section: record.section });
    }
  }
  return saveVisualHomepageSection(input);
}

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
  const [mobilePanel, setMobilePanel] = useState<"sections" | "properties" | null>(null);
  const { retry, savedAtById } = useHomepageAutosave({
    locale,
    state,
    dispatch,
    save: persistHomepageSection,
  });
  const saveStates = Object.values(state.saveStateById);
  useUnsavedChangesGuard([
    ...saveStates.map((item) => item.status),
    state.structuralRollback ? "saving" : "idle",
  ]);

  const selectedId = state.selectedSectionId;
  const selectedDraft = selectedId ? state.draftsBySectionId[selectedId] ?? null : null;
  const templateItems = getFixedHomepageTemplate(
    state.orderedIds.map((id) => state.draftsBySectionId[id]).filter((draft): draft is HomepageEditorDraft => Boolean(draft)),
  );
  const selectedItem = templateItems.find((item) => item.selectionId === selectedId) ?? null;
  const selectedSaveState = selectedId ? state.saveStateById[selectedId] : undefined;
  const storyUsageById = templateItems.reduce<Record<string, string[]>>((usage, item) => {
    if (item.draft?.blockType === "hero-story" && item.draft.storyId) {
      (usage[item.draft.storyId] ??= []).push("Hero Story");
    }
    if (item.draft?.blockType === "hero-sidebar") {
      item.draft.storyIds.forEach((storyId, index) => {
        (usage[storyId] ??= []).push(`Secondary Story ${index + 1}`);
      });
    }
    return usage;
  }, {});

  function updateDraft(draft: HomepageEditorDraft) {
    const definition = getHomepageBlockDefinition(draft.blockType);
    const errors = definition
      ? validateHomepageEditorDraft(draft, definition)
      : { blockType: "This section type is not supported." };
    dispatch({ type: "edit-field", sectionId: draft.id, draft });
    dispatch({ type: "validation-set", sectionId: draft.id, errors });
  }

  return (
    <div className="min-w-0 overflow-x-hidden bg-[#f8f6f1] text-[#171512]">
      <HomepageBuilderToolbar
        locale={locale}
        saveStates={saveStates}
        savedAtById={savedAtById}
      />
      <div className="sticky top-[8.25rem] z-20 flex gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm xl:hidden">
        <Button aria-label="Open sections navigator" onClick={() => setMobilePanel("sections")} size="sm" variant="outline">
          <Layers3 aria-hidden="true" /> Sections
        </Button>
        <Button aria-label="Open properties inspector" disabled={!selectedItem} onClick={() => setMobilePanel("properties")} size="sm" variant="outline">
          <SlidersHorizontal aria-hidden="true" /> Properties
        </Button>
        <span className="ml-auto self-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Canvas</span>
      </div>
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
      <div className="relative grid min-h-[calc(100dvh-12rem)] min-w-0 xl:grid-cols-[17.5rem_minmax(0,1fr)_22rem]">
        {mobilePanel ? (
          <button aria-label="Close open builder panel" className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => setMobilePanel(null)} type="button" />
        ) : null}
        <section
          aria-label="Sections navigator"
          className={`${mobilePanel === "sections" ? "fixed" : "hidden"} inset-y-0 left-0 z-50 w-[min(21rem,88vw)] overflow-y-auto border-r border-border bg-[#fbfaf7] p-4 shadow-xl xl:static xl:block xl:w-auto xl:shadow-none`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Structure</p>
              <h2 className="font-heading text-xl font-semibold" id="homepage-sections-heading">Sections</h2>
            </div>
            <Button aria-label="Close sections navigator" className="xl:hidden" onClick={() => setMobilePanel(null)} size="icon" variant="ghost"><X aria-hidden="true" /></Button>
          </div>
          <FixedHomepageSectionList
            draftsBySectionId={state.draftsBySectionId}
            onSelect={(sectionId) => dispatch({ type: "select", sectionId })}
            orderedIds={state.orderedIds}
            saveStateById={state.saveStateById}
            selectedSectionId={selectedId}
          />
        </section>
        <main aria-label="Homepage canvas" className="min-w-0 bg-[#efede7] p-3 sm:p-5 xl:border-r xl:border-border">
          <HomepagePreviewFrame
            dispatch={dispatch}
            locale={locale}
            revision={state.previewRevision}
            selectedSectionId={selectedId}
            viewport={state.viewport}
          />
        </main>
        <section
          aria-label="Properties inspector"
          className={`${mobilePanel === "properties" ? "fixed" : "hidden"} inset-y-0 right-0 z-50 w-[min(24rem,92vw)] overflow-y-auto border-l border-border bg-[#fbfaf7] p-4 shadow-xl xl:static xl:block xl:w-auto xl:shadow-none`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Selected section</p>
              <h2 className="font-heading text-xl font-semibold">Properties</h2>
            </div>
            <Button aria-label="Close properties inspector" className="xl:hidden" onClick={() => setMobilePanel(null)} size="icon" variant="ghost"><X aria-hidden="true" /></Button>
          </div>
          {canManage ? (
            <>
              <HomepageInspector
                draft={selectedDraft}
                fieldErrors={selectedId ? state.validationById[selectedId] ?? {} : {}}
                locale={locale}
                onChange={updateDraft}
                selectionDescription={selectedItem?.description ?? null}
                selectionLabel={selectedItem?.label ?? null}
                storyUsageById={storyUsageById}
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
    </div>
  );
}
