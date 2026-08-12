"use client";

import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

type ListBlockType = "breaking-news" | "latest-news" | "trending" | "opinion";

const descriptions: Record<ListBlockType, string> = {
  "breaking-news": "Shows the newest breaking-news stories resolved by the homepage service.",
  "latest-news": "Shows the newest published stories in this language.",
  trending: "Shows the current trending story collection.",
  opinion: "Shows the latest opinion stories.",
};

export function ListBlockEditor({ draft, fieldErrors, onChange }: BlockEditorProps<ListBlockType>) {
  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">Story list</legend>
        <p className="text-sm leading-relaxed text-muted-foreground">{descriptions[draft.blockType]}</p>
        <label className="grid gap-2 text-sm font-medium">
          Story count
          <input
            aria-describedby={fieldErrors.limit ? `${draft.id}-limit-error` : undefined}
            aria-invalid={Boolean(fieldErrors.limit)}
            className="min-h-11 rounded-md border border-input bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            max={100}
            min={1}
            onChange={(event) => onChange({ ...draft, limit: event.target.valueAsNumber })}
            type="number"
            value={draft.limit}
          />
          {fieldErrors.limit ? <span className="text-xs text-destructive" id={`${draft.id}-limit-error`}>{fieldErrors.limit}</span> : null}
        </label>
      </fieldset>
    </div>
  );
}

