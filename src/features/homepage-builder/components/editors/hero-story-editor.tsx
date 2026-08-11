"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { StoryPickerOption } from "../../search/homepage-picker.types.ts";
import { StoryPicker } from "../pickers/story-picker";
import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

export function HeroStoryEditor({ locale, draft, fieldErrors, onChange }: BlockEditorProps<"hero-story">) {
  const [selectedStory, setSelectedStory] = useState<StoryPickerOption | null>(null);

  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">Hero story</legend>
        {selectedStory ? (
          <Card padding="sm" variant="bordered">
            <CardContent className="p-0">
              <p className="font-medium">{selectedStory.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{selectedStory.category?.name ?? "Uncategorized"}</p>
            </CardContent>
          </Card>
        ) : draft.storyId ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">A published story is selected. Choose another story to replace it.</p>
        ) : null}
        <StoryPicker
          locale={locale}
          onSelect={(story) => {
            setSelectedStory(story);
            onChange({ ...draft, storyId: story.id });
          }}
          selected={selectedStory}
        />
        {fieldErrors.storyId ? <p className="text-xs text-destructive" role="alert">{fieldErrors.storyId}</p> : null}
      </fieldset>
    </div>
  );
}

