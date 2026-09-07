"use client";

import type { ComponentType } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  HomepageEditorDraft,
  HomepageEditorFieldErrors,
} from "../../editor/homepage-editor.types";
import type { HomepageLocale } from "../../homepage-builder.types";
import {
  getVisualBlockEditor,
  type BlockEditorProps,
} from "../editors/block-editor-registry";

export function HomepageInspector({
  locale,
  draft,
  fieldErrors,
  onChange,
  storyUsageById,
  selectionDescription,
  selectionLabel,
}: Readonly<{
  locale: HomepageLocale;
  draft: HomepageEditorDraft | null;
  fieldErrors: HomepageEditorFieldErrors;
  onChange(draft: HomepageEditorDraft): void;
  storyUsageById: Readonly<Record<string, readonly string[]>>;
  selectionDescription: string | null;
  selectionLabel: string | null;
}>) {
  if (!draft) {
    return (
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent>
          {selectionLabel ? <h2 className="text-lg font-semibold">{selectionLabel}</h2> : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {selectionDescription ?? "Select a section to edit its settings."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const definition = getVisualBlockEditor(draft.blockType);
  if (!definition) {
    return (
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent>
          <p className="text-sm text-destructive" role="alert">This section type is not supported.</p>
        </CardContent>
      </Card>
    );
  }

  const Editor = definition.component as ComponentType<BlockEditorProps>;
  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="p-0 pb-4 sm:p-0 sm:pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Section settings</p>
        <h2 className="text-lg font-semibold">{selectionLabel ?? definition.label}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {selectionDescription ?? "Position and layout are fixed by the public homepage template."}
        </p>
      </CardHeader>
      <CardContent className="border-t border-border p-0 pt-5 sm:p-0 sm:pt-5">
        <Editor locale={locale} draft={draft} fieldErrors={fieldErrors} onChange={onChange} storyUsageById={storyUsageById} />
      </CardContent>
    </Card>
  );
}
