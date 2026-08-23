import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/config/env";
import type { Database } from "./types";

export function createAdminClient() {
  const { supabaseUrl } = env.public;
  const { supabaseServiceRoleKey } = env.server.replayStorage;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Private replay delivery is unavailable.");
  }
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
