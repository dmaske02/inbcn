type SessionPolicyInput = Readonly<{
  status: string;
  now: string;
  startsAt: string;
  endsAt: string;
  activeMember: boolean;
}>;

export type SessionPolicyResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "inactive-member" | "invalid-window" | "not-approved" | "outside-window" }>;

export function sessionPolicy(input: SessionPolicyInput): SessionPolicyResult {
  if (input.status !== "approved") return { ok: false, reason: "not-approved" };
  if (!input.activeMember) return { ok: false, reason: "inactive-member" };
  const now = Date.parse(input.now);
  const startsAt = Date.parse(input.startsAt);
  const endsAt = Date.parse(input.endsAt);
  if (![now, startsAt, endsAt].every(Number.isFinite) || endsAt <= startsAt) {
    return { ok: false, reason: "invalid-window" };
  }
  return now < startsAt || now > endsAt
    ? { ok: false, reason: "outside-window" }
    : { ok: true };
}
