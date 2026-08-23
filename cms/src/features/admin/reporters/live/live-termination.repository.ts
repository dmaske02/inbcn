import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TerminationRequest = Readonly<{
  id: string;
  status: string;
  profileId: string;
  roomName: string | null;
}>;

function map(row: Readonly<{ id: string; status: string; profile_id: string; livekit_room_name: string | null }>): TerminationRequest {
  return { id: row.id, status: row.status, profileId: row.profile_id, roomName: row.livekit_room_name };
}

async function get(id: string): Promise<TerminationRequest | null> {
  const { data, error } = await (await createClient()).from("reporter_live_requests")
    .select("id, status, profile_id, livekit_room_name").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? map(data) : null;
}

async function terminate(id: string, reason: string): Promise<void> {
  const { error } = await (await createClient()).rpc("terminate_reporter_live_request", {
    p_request_id: id,
    p_termination_reason: reason,
  });
  if (error) throw error;
}

export const liveTerminationRepository = { get, terminate } as const;
