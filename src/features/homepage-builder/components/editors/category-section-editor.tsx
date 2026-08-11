"use client";

import { useState } from "react";
import type { CategoryPickerOption } from "../../search/homepage-picker.types.ts";
import { CategoryPicker } from "../pickers/category-picker";
import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

export function CategorySectionEditor({ locale, draft, fieldErrors, onChange }: BlockEditorProps<"category-section">) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryPickerOption | null>(null);

  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <fieldset className="grid gap-4">
        <legend className="text-sm font-semibold">Category content</legend>
        {selectedCategory ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="font-medium">{selectedCategory.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{selectedCategory.publishedStoryCount} published stories</p>
          </div>
        ) : draft.categoryId ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">An active category is selected. Choose another category to replace it.</p>
        ) : null}
        <CategoryPicker
          locale={locale}
          onSelect={(category) => {
            setSelectedCategory(category);
            onChange({ ...draft, categoryId: category.id });
          }}
          selected={selectedCategory}
        />
        {fieldErrors.categoryId ? <p className="text-xs text-destructive" role="alert">{fieldErrors.categoryId}</p> : null}
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

