import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SearchDateFilter } from "../server/services/search.model";

type SearchFormProps = Readonly<{
  locale: string;
  query: string;
  category: string | null;
  date: SearchDateFilter;
  languageName: string;
  categories: readonly Readonly<{ name: string; slug: string }>[];
  labels: Readonly<{
    search: string;
    placeholder: string;
    submit: string;
    category: string;
    allCategories: string;
    language: string;
    date: string;
    allDates: string;
    pastDay: string;
    pastWeek: string;
    pastMonth: string;
    order: string;
    newest: string;
  }>;
}>;

const fieldClassName =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export function SearchForm({
  locale,
  query,
  category,
  date,
  languageName,
  categories,
  labels,
}: SearchFormProps) {
  return (
    <form
      action={`/${locale}/search`}
      method="get"
      role="search"
      aria-label={labels.search}
      className="border-y border-border py-6"
    >
      <label htmlFor="public-search-query" className="text-sm font-semibold">
        {labels.search}
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="public-search-query"
          name="q"
          type="search"
          required
          maxLength={160}
          defaultValue={query}
          placeholder={labels.placeholder}
          autoComplete="off"
          className={fieldClassName}
        />
        <Button type="submit" variant="signal" className="shrink-0 sm:min-w-32">
          <Search aria-hidden="true" />
          {labels.submit}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {labels.category}
          <select name="category" defaultValue={category ?? ""} className={fieldClassName}>
            <option value="">{labels.allCategories}</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>{item.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {labels.language}
          <select disabled defaultValue={locale} className={fieldClassName}>
            <option value={locale}>{languageName}</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {labels.date}
          <select name="date" defaultValue={date} className={fieldClassName}>
            <option value="all">{labels.allDates}</option>
            <option value="day">{labels.pastDay}</option>
            <option value="week">{labels.pastWeek}</option>
            <option value="month">{labels.pastMonth}</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {labels.order}
          <select disabled defaultValue="newest" className={fieldClassName}>
            <option value="newest">{labels.newest}</option>
          </select>
        </label>
      </div>
    </form>
  );
}
