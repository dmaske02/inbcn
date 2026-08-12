import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import type { Database } from "./types";

function getAdminCredentials() {
  const { supabaseUrl } = env.public;
  const { supabaseServiceRoleKey } = env.server;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

/**
 * Creates a privileged client that bypasses Row Level Security.
 * Import this module only from trusted server-side administration code.
 */
export function createAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getAdminCredentials();

  return createSupabaseClient<Database>(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
