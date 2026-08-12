"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StoryPickerOption } from "../../search/homepage-picker.types.ts";
import { StoryPicker } from "../pickers/story-picker";
import type { BlockEditorProps } from "./block-editor-registry";
import { SharedSectionFields } from "./shared-section-fields";

const POSITIONS = [0, 1, 2] as const;

export function HeroSidebarEditor({
  locale,
  draft,
  fieldErrors,
  onChange,
}: BlockEditorProps<"hero-sidebar">) {
  const [selectedStoriesById, setSelectedStoriesById] = useState<Partial<Record<string, StoryPickerOption>>>({});
  const [announcement, setAnnouncement] = useState("");

  function selectStory(index: number, story: StoryPickerOption) {
    if (draft.storyIds.some((storyId, currentIndex) => storyId === story.id && currentIndex !== index)) {
      setAnnouncement(`${story.title} is already selected.`);
      return;
    }

    const nextIds = [...draft.storyIds];
    nextIds[index] = story.id;
    const storyIds = nextIds.filter((storyId): storyId is string => Boolean(storyId)).slice(0, 3);
    setSelectedStoriesById((current) => ({ ...current, [story.id]: story }));
    setAnnouncement(`${story.title} selected as Secondary Story ${index + 1}.`);
    onChange({ ...draft, storyIds });
  }

  function removeStory(index: number) {
    const storyIds = draft.storyIds.filter((_, currentIndex) => currentIndex !== index);
    setAnnouncement(`Secondary Story ${index + 1} removed.`);
    onChange({ ...draft, storyIds });
  }

  return (
    <div className="grid gap-6">
      <SharedSectionFields draft={draft} fieldErrors={fieldErrors} onChange={onChange} />
      <fieldset className="grid gap-4">
        <legend className="text-sm font-semibold">Stories</legend>
        {POSITIONS.map((index) => {
          const selected = selectedStoriesById[draft.storyIds[index] ?? ""] ?? null;
          const hasPersistedSelection = Boolean(draft.storyIds[index]);
          return (
            <div className="grid gap-3 rounded-md border border-border p-4" key={index}>
              <h3 className="text-sm font-semibold">Secondary Story {index + 1}</h3>
              {selected ? (
                <Card padding="sm" variant="bordered">
                  <CardContent className="p-0">
                    <p className="font-medium">{selected.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{selected.category?.name ?? "Uncategorized"}</p>
                  </CardContent>
                </Card>
              ) : hasPersistedSelection ? (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  A published story is selected. Choose another story to replace it.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <StoryPicker
                  locale={locale}
                  onSelect={(story) => selectStory(index, story)}
                  selected={selected}
                  title={`Choose Secondary Story ${index + 1}`}
                  triggerLabel={hasPersistedSelection ? `Change Secondary Story ${index + 1}` : `Choose Secondary Story ${index + 1}`}
                />
                {hasPersistedSelection ? (
                  <Button
                    aria-label={`Remove Secondary Story ${index + 1}`}
                    disabled={draft.storyIds.length === 1}
                    onClick={() => removeStory(index)}
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {fieldErrors.storyIds ? <p className="text-xs text-destructive" role="alert">{fieldErrors.storyIds}</p> : null}
        <p aria-live="polite" className="sr-only" role="status">{announcement}</p>
      </fieldset>
    </div>
  );
}
