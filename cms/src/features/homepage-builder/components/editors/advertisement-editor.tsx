"use client";

import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

const slots = ["Header advertisement", "Sidebar advertisement", "Inline advertisement", "Footer advertisement"] as const;

export function AdvertisementEditor({ draft, fieldErrors, onChange }: BlockEditorProps<"advertisement-placeholder">) {
  const options = slots.includes(draft.label as (typeof slots)[number]) ? slots : [draft.label, ...slots];
  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <label className="grid gap-2 text-sm font-medium">
        Advertisement slot
        <select
          aria-describedby={fieldErrors.label ? `${draft.id}-label-error` : undefined}
          aria-invalid={Boolean(fieldErrors.label)}
          className="min-h-11 rounded-md border border-input bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
          value={draft.label}
        >
          {options.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select>
        {fieldErrors.label ? <span className="text-xs text-destructive" id={`${draft.id}-label-error`}>{fieldErrors.label}</span> : null}
      </label>
    </div>
  );
}
