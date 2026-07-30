import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TableRow } from "@/lib/supabase/types";
import type { LanguageDto } from "./dto";
import { assertRepositoryQuerySucceeded } from "./errors";

const LANGUAGE_COLUMNS = "id, code, name, native_name" as const;

type LanguageRow = Pick<
  TableRow<"languages">,
  "id" | "code" | "name" | "native_name"
>;

function toLanguageDto(row: LanguageRow): LanguageDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nativeName: row.native_name,
  };
}

export async function getEnabledLanguages(): Promise<LanguageDto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("languages")
    .select(LANGUAGE_COLUMNS)
    .eq("is_active", true)
    .order("name");

  assertRepositoryQuerySucceeded(error, "load enabled languages");
  return data.map(toLanguageDto);
}

export async function getLanguage(code: string): Promise<LanguageDto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("languages")
    .select(LANGUAGE_COLUMNS)
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();

  assertRepositoryQuerySucceeded(error, "load language");
  return data ? toLanguageDto(data) : null;
}
