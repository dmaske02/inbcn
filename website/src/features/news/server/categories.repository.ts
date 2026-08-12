import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TableRow } from "@/lib/supabase/types";
import type { CategoryDto } from "./dto";
import { assertRepositoryQuerySucceeded } from "./errors";
import { getLanguage } from "./languages.repository";

const CATEGORY_COLUMNS =
  "id, language_id, parent_id, name, slug, description, sort_order" as const;

type CategoryRow = Pick<
  TableRow<"categories">,
  | "id"
  | "language_id"
  | "parent_id"
  | "name"
  | "slug"
  | "description"
  | "sort_order"
>;

function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    languageId: row.language_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

export async function getCategories(locale: string): Promise<CategoryDto[]> {
  const language = await getLanguage(locale);
  if (!language) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("language_id", language.id)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  assertRepositoryQuerySucceeded(error, "load categories");
  return data.map(toCategoryDto);
}

export async function getCategoryBySlug(
  locale: string,
  slug: string,
): Promise<CategoryDto | null> {
  const language = await getLanguage(locale);
  if (!language) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("language_id", language.id)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  assertRepositoryQuerySucceeded(error, "load category");
  return data ? toCategoryDto(data) : null;
}
