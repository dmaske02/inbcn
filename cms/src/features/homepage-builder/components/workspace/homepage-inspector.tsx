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
}: Readonly<{
  locale: HomepageLocale;
  draft: HomepageEditorDraft | null;
  fieldErrors: HomepageEditorFieldErrors;
  onChange(draft: HomepageEditorDraft): void;
}>) {
  if (!draft) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a section to edit its settings.</p>
        </CardContent>
      </Card>
    );
  }

  const definition = getVisualBlockEditor(draft.blockType);
  if (!definition) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive" role="alert">This section type is not supported.</p>
        </CardContent>
      </Card>
    );
  }

  const Editor = definition.component as ComponentType<BlockEditorProps>;
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Section settings</p>
        <h2 className="text-lg font-semibold">{definition.label}</h2>
      </CardHeader>
      <CardContent>
        <Editor locale={locale} draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      </CardContent>
    </Card>
  );
}
