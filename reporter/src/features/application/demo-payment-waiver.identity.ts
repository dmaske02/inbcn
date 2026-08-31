import "server-only";

import { createClient } from "../../lib/supabase/server.ts";
import { REPORTER_DEMO_PHONE } from "../auth/temporary-auth.model.ts";

export async function getCurrentDemoIdentity(expectedProfileId: string) {
  const { data, error } = await (await createClient()).auth.getUser();
  const user = data.user;
  if (error || !user || user.id !== expectedProfileId) return null;
  const phone = user.phone?.startsWith("+") ? user.phone : `+${user.phone ?? ""}`;
  if (phone !== REPORTER_DEMO_PHONE || user.app_metadata?.reporter_demo_identity !== true) return null;
  return { phone, demoMarked: true as const };
}
