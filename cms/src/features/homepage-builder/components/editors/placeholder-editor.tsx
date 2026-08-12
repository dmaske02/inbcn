"use client";

import { Badge } from "@/components/ui/badge";
import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

type PlaceholderBlockType = "custom-html-placeholder" | "future-placeholder";

export function PlaceholderEditor({ draft, fieldErrors, onChange }: BlockEditorProps<PlaceholderBlockType>) {
  const isHtmlPlaceholder = draft.blockType === "custom-html-placeholder";
  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
        <Badge variant="outline">Placeholder</Badge>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isHtmlPlaceholder
            ? "This is an informational placeholder. It never executes HTML or injects markup into the homepage."
            : "This reserved section has no editorial configuration in the current phase."}
        </p>
      </div>
    </div>
  );
}

