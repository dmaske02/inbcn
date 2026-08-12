"use client";

import { Badge } from "@/components/ui/badge";
import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

export function LiveTvEditor({ draft, fieldErrors, onChange }: BlockEditorProps<"live-tv">) {
  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <Badge variant="verified">Zero configuration</Badge>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">This section automatically uses the Live TV configuration for the active homepage language.</p>
      </div>
    </div>
  );
}

