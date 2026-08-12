"use client";

import { searchHomepageStories } from "../../homepage-builder.actions";
import type { HomepageLocale } from "../../homepage-builder.types.ts";
import type { StoryPickerOption } from "../../search/homepage-picker.types.ts";
import { PickerDialog } from "./picker-dialog";

type StoryPickerProps = Readonly<{
  locale: HomepageLocale;
  selected: StoryPickerOption | null;
  title?: string;
  triggerLabel?: string;
  onSelect(story: StoryPickerOption): void;
}>;

const DATE_LOCALES: Record<HomepageLocale, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

function StorySummary({ item, locale }: Readonly<{ item: StoryPickerOption; locale: HomepageLocale }>) {
  const dateLocale = DATE_LOCALES[locale];
  return (
    <span className="flex items-center gap-3">
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
      </span>
    </span>
  );
}

export function StoryPicker({
  locale,
  selected,
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
      renderItem={(item) => <StorySummary item={item} locale={locale} />}
      renderSelected={(item) => <StorySummary item={item} locale={locale} />}
      search={searchHomepageStories}
      searchLabel="Search published stories"
      selected={selected}
      title={title}
      triggerLabel={triggerLabel}
    />
  );
}
