import "server-only";

import { createClient } from "../../lib/supabase/server.ts";

export type SignupLanguage = Readonly<{ id: string; code: string; name: string; nativeName: string }>;

export async function listSignupLanguages(): Promise<readonly SignupLanguage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("languages")
    .select("id, code, name, native_name")
    .eq("is_active", true)
    .order("name");
  if (error) return [];
  return data.map((language) => ({
    id: language.id,
    code: language.code,
    name: language.name,
    nativeName: language.native_name,
  }));
}
