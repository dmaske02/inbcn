import "server-only";

import { getCurrentMembership } from "../membership/membership.repository.ts";
import { createClient } from "../../lib/supabase/server.ts";
import type { LiveRequestInput } from "./live-request.model.ts";

export type ReporterLiveRequest = Readonly<{
  id: string;
  title: string;
  purpose: string;
  intendedLocality: string;
  expectedStartsAt: string;
  expectedDurationMinutes: number;
  supportingNotes: string | null;
  status: string;
  decisionReason: string | null;
  approvedStartsAt: string | null;
  approvedEndsAt: string | null;
  terminationReason: string | null;
  createdAt: string;
}>;

export class LiveRequestRepositoryError extends Error {
  constructor(message = "LIVE_REQUEST_REPOSITORY_UNAVAILABLE") {
    super(message);
    this.name = "LiveRequestRepositoryError";
  }
}

function mapRequest(row: {
  id: string; title: string; purpose: string; intended_locality: string; expected_starts_at: string;
  expected_duration_minutes: number; supporting_notes: string | null; status: string; decision_reason: string | null;
  approved_starts_at: string | null; approved_ends_at: string | null; termination_reason: string | null; created_at: string;
}): ReporterLiveRequest {
  return {
    id: row.id, title: row.title, purpose: row.purpose, intendedLocality: row.intended_locality,
    expectedStartsAt: row.expected_starts_at, expectedDurationMinutes: row.expected_duration_minutes,
    supportingNotes: row.supporting_notes, status: row.status, decisionReason: row.decision_reason,
    approvedStartsAt: row.approved_starts_at, approvedEndsAt: row.approved_ends_at,
    terminationReason: row.termination_reason, createdAt: row.created_at,
  };
}

async function create(profileId: string, input: LiveRequestInput): Promise<ReporterLiveRequest> {
  const { data, error } = await (await createClient()).from("reporter_live_requests")
    .insert({
      profile_id: profileId,
      title: input.title,
      purpose: input.purpose,
      intended_locality: input.intendedLocality,
      expected_starts_at: input.expectedStartsAt,
      expected_duration_minutes: input.expectedDurationMinutes,
      supporting_notes: input.supportingNotes,
    })
    .select("id, title, purpose, intended_locality, expected_starts_at, expected_duration_minutes, supporting_notes, status, decision_reason, approved_starts_at, approved_ends_at, termination_reason, created_at")
    .single();
  if (error || !data) throw new LiveRequestRepositoryError(error?.message);
  return mapRequest(data);
}

async function list(profileId: string): Promise<readonly ReporterLiveRequest[]> {
  const { data, error } = await (await createClient()).from("reporter_live_requests")
    .select("id, title, purpose, intended_locality, expected_starts_at, expected_duration_minutes, supporting_notes, status, decision_reason, approved_starts_at, approved_ends_at, termination_reason, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw new LiveRequestRepositoryError(error.message);
  return data.map(mapRequest);
}

async function get(profileId: string, id: string): Promise<ReporterLiveRequest | null> {
  const { data, error } = await (await createClient()).from("reporter_live_requests")
    .select("id, title, purpose, intended_locality, expected_starts_at, expected_duration_minutes, supporting_notes, status, decision_reason, approved_starts_at, approved_ends_at, termination_reason, created_at")
    .eq("id", id).eq("profile_id", profileId).maybeSingle();
  if (error) throw new LiveRequestRepositoryError(error.message);
  return data ? mapRequest(data) : null;
}

export const liveRequestRepository = { create, get, getAccess: getCurrentMembership, list } as const;
