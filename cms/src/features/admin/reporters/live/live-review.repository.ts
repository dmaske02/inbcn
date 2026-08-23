import "server-only";

import { createClient } from "@/lib/supabase/server";

export type LiveReviewRequest = Readonly<{
  id: string;
  profileId: string;
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

export class LiveReviewRepositoryError extends Error {
  constructor(message = "Live requests are temporarily unavailable.") {
    super(message);
    this.name = "LiveReviewRepositoryError";
  }
}

const fields = "id, profile_id, title, purpose, intended_locality, expected_starts_at, expected_duration_minutes, supporting_notes, status, decision_reason, approved_starts_at, approved_ends_at, termination_reason, created_at";

function mapRequest(row: {
  id: string; profile_id: string; title: string; purpose: string; intended_locality: string; expected_starts_at: string;
  expected_duration_minutes: number; supporting_notes: string | null; status: string; decision_reason: string | null;
  approved_starts_at: string | null; approved_ends_at: string | null; termination_reason: string | null; created_at: string;
}): LiveReviewRequest {
  return {
    id: row.id, profileId: row.profile_id, title: row.title, purpose: row.purpose, intendedLocality: row.intended_locality,
    expectedStartsAt: row.expected_starts_at, expectedDurationMinutes: row.expected_duration_minutes,
    supportingNotes: row.supporting_notes, status: row.status, decisionReason: row.decision_reason,
    approvedStartsAt: row.approved_starts_at, approvedEndsAt: row.approved_ends_at,
    terminationReason: row.termination_reason, createdAt: row.created_at,
  };
}

async function list(): Promise<readonly LiveReviewRequest[]> {
  const { data, error } = await (await createClient()).from("reporter_live_requests")
    .select(fields).order("created_at", { ascending: false });
  if (error) throw new LiveReviewRepositoryError();
  return data.map(mapRequest);
}

async function get(id: string): Promise<LiveReviewRequest | null> {
  const { data, error } = await (await createClient()).from("reporter_live_requests")
    .select(fields).eq("id", id).maybeSingle();
  if (error) throw new LiveReviewRepositoryError();
  return data ? mapRequest(data) : null;
}

async function approve(id: string, startsAt: string, endsAt: string): Promise<void> {
  const { error } = await (await createClient()).rpc("approve_reporter_live_request", {
    p_request_id: id, p_approved_starts_at: startsAt, p_approved_ends_at: endsAt,
  });
  if (error) throw new LiveReviewRepositoryError(error.message);
}

async function reject(id: string, reason: string): Promise<void> {
  const { error } = await (await createClient()).rpc("reject_reporter_live_request", {
    p_request_id: id, p_decision_reason: reason,
  });
  if (error) throw new LiveReviewRepositoryError(error.message);
}

export const liveReviewRepository = { list, get, approve, reject } as const;
