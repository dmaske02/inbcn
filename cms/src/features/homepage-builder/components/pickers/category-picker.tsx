"use client";

import { searchHomepageCategories } from "../../homepage-builder.actions";
import type { HomepageLocale } from "../../homepage-builder.types.ts";
import type { CategoryPickerOption } from "../../search/homepage-picker.types.ts";
import { PickerDialog } from "./picker-dialog";

type CategoryPickerProps = Readonly<{
  locale: HomepageLocale;
  selected: CategoryPickerOption | null;
  onSelect(category: CategoryPickerOption): void;
}>;

function CategorySummary({ item }: Readonly<{ item: CategoryPickerOption }>) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="font-medium text-foreground">{item.name}</span>
      <span className="text-xs text-muted-foreground">{item.publishedStoryCount} published stories</span>
    </span>
  );
}

export function CategoryPicker({ locale, selected, onSelect }: CategoryPickerProps) {
  return (
    <PickerDialog
      description="Search active categories in the current homepage language."
      emptyMessage="No active categories match this search."
      locale={locale}
      onSelect={onSelect}
      renderItem={(item) => <CategorySummary item={item} />}
      renderSelected={(item) => <CategorySummary item={item} />}
      search={searchHomepageCategories}
      searchLabel="Search active categories"
      selected={selected}
      title="Choose a category"
      triggerLabel={selected ? "Change category" : "Choose category"}
    />
  );
}

