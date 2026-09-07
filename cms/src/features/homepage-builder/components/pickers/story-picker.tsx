"use client";

import { Check, TriangleAlert } from "lucide-react";
import { searchHomepageStories } from "../../homepage-builder.actions";
import type { HomepageLocale } from "../../homepage-builder.types.ts";
import type { StoryPickerOption } from "../../search/homepage-picker.types.ts";
import { PickerDialog } from "./picker-dialog";

type StoryPickerProps = Readonly<{
  locale: HomepageLocale;
  selected: StoryPickerOption | null;
  currentStoryId?: string | null;
  currentSlotLabel: string;
  storyUsageById: Readonly<Record<string, readonly string[]>>;
  title?: string;
  triggerLabel?: string;
  onSelect(story: StoryPickerOption): void;
}>;

const DATE_LOCALES: Record<HomepageLocale, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

function StorySummary({ currentSlotLabel, currentStoryId, item, locale, usageSlots }: Readonly<{
  currentSlotLabel: string;
  currentStoryId: string | null;
  item: StoryPickerOption;
  locale: HomepageLocale;
  usageSlots: readonly string[];
}>) {
  const dateLocale = DATE_LOCALES[locale];
  const isCurrent = item.id === currentStoryId;
  const otherUsageSlots = usageSlots.filter((slot) => slot !== currentSlotLabel);
  return (
    <span className="flex items-start gap-3">
      {item.thumbnail ? (
        // Arbitrary newsroom source thumbnails are intentionally rendered without Next Image host coupling.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={item.thumbnail.altText} className="size-16 shrink-0 rounded-sm border border-border object-cover" height={item.thumbnail.height ?? 64} src={item.thumbnail.url} width={item.thumbnail.width ?? 64} />
      ) : <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-sm bg-muted text-xs text-muted-foreground">No image</span>}
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{item.title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {item.category?.name ?? "Uncategorized"} · {new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(item.publishedAt))}
        </span>
        {isCurrent ? (
          <span className="mt-2 block border-t border-border pt-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-foreground"><Check aria-hidden="true" className="size-3.5" />This story is currently selected</span>
            <span className="mt-1 block text-muted-foreground">Current slot: {currentSlotLabel}</span>
          </span>
        ) : otherUsageSlots.length > 0 ? (
          <span className="mt-2 block border-t border-border pt-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-foreground"><TriangleAlert aria-hidden="true" className="size-3.5" />This story is in use</span>
            {otherUsageSlots.map((slot) => <span className="mt-1 block text-muted-foreground" key={slot}>In use in {slot}</span>)}
          </span>
        ) : <span className="mt-2 block border-t border-border pt-2 text-xs font-medium text-muted-foreground">Available</span>}
      </span>
    </span>
  );
}

function formatSlotList(slots: readonly string[]) {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(slots);
}

export function StoryPicker({
  locale,
  selected,
  currentStoryId = selected?.id ?? null,
  currentSlotLabel,
  storyUsageById,
  onSelect,
  title = "Choose a hero story",
  triggerLabel = selected ? "Change story" : "Choose story",
}: StoryPickerProps) {
  return (
    <PickerDialog
      description="Search published stories in the active homepage language."
      emptyMessage="No published stories match this search."
      locale={locale}
      onSelect={onSelect}
      renderItem={(item) => <StorySummary currentSlotLabel={currentSlotLabel} currentStoryId={currentStoryId} item={item} locale={locale} usageSlots={storyUsageById[item.id] ?? []} />}
      renderSelected={(item) => <StorySummary currentSlotLabel={currentSlotLabel} currentStoryId={currentStoryId} item={item} locale={locale} usageSlots={storyUsageById[item.id] ?? []} />}
      search={searchHomepageStories}
      searchLabel="Search published stories"
      selected={selected}
      selectedId={currentStoryId}
      selectionConfirmation={(item) => {
        const otherUsageSlots = (storyUsageById[item.id] ?? []).filter((slot) => slot !== currentSlotLabel);
        return otherUsageSlots.length > 0 && item.id !== currentStoryId
          ? {
              description: `This story is in use in ${formatSlotList(otherUsageSlots)}. Do you want to use the same story in ${currentSlotLabel}?`,
              title: "Reuse this story?",
            }
          : null;
      }}
      title={title}
      triggerLabel={triggerLabel}
    />
  );
}
