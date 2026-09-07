"use client";

import type { HomepageEditorDraft, HomepageEditorSaveState } from "../../editor/homepage-editor.types";
import { getFixedHomepageTemplate } from "../../homepage-fixed-template.model";

export function FixedHomepageSectionList({ orderedIds, draftsBySectionId, saveStateById, selectedSectionId, onSelect }: Readonly<{
  orderedIds: readonly string[];
  draftsBySectionId: Readonly<Record<string, HomepageEditorDraft>>;
  saveStateById: Readonly<Record<string, HomepageEditorSaveState>>;
  selectedSectionId: string | null;
  onSelect(sectionId: string): void;
}>) {
  const drafts = orderedIds.map((id) => draftsBySectionId[id]).filter((draft): draft is HomepageEditorDraft => Boolean(draft));
  const items = getFixedHomepageTemplate(drafts);

  return (
    <ol aria-label="Fixed homepage structure" className="border-t border-border">
      {items.map((item, index) => {
        const selected = item.selectionId === selectedSectionId;
        const configured = Boolean(item.draft);
        const saveState = item.draft ? saveStateById[item.draft.id]?.status : undefined;
        return (
          <li className="border-b border-border" key={item.key}>
            <button
              aria-pressed={selected}
              className={`flex w-full items-start gap-3 border-l-2 px-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-l-[#b3261e] bg-[#f1e9e3]" : "border-l-transparent hover:bg-[#f4f1eb]"}`}
              onClick={() => onSelect(item.selectionId)}
              type="button"
            >
              <span className="w-6 pt-0.5 text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.fixed ? "Fixed site chrome" : configured ? (item.draft?.enabled ? "Enabled" : "Disabled") : "Uses public default"}
                  {item.draft?.blockType === "category-section" ? ` · ${item.draft.title}` : ""}
                </span>
              </span>
              {!item.fixed ? <span className={`mt-1.5 size-2 rounded-full ${item.draft?.enabled ? "bg-emerald-700" : "border border-muted-foreground"}`} aria-hidden="true" /> : null}
              {saveState === "dirty" || saveState === "saving" ? <span className="sr-only">{saveState}</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
