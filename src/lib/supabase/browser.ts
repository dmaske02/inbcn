import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

function getBrowserCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey };
}

export function createClient() {
  const { url, anonKey } = getBrowserCredentials();

  return createBrowserClient<Database>(url, anonKey);
}
