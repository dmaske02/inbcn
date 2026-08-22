import "server-only";

import {
  membershipAccess,
  membershipStatusAt,
  type ReporterMembershipAccess,
  type ReporterMembershipStatus,
} from "@inbcn/domain";

import { createClient } from "../../lib/supabase/server.ts";

export type CurrentMembership = Readonly<{
  status: ReporterMembershipStatus;
  access: ReporterMembershipAccess;
  membershipExpiresAt: string;
  membershipGraceEndsAt: string;
  canPublishDirectly: boolean;
  canBroadcastLive: boolean;
}>;

export class MembershipRepositoryError extends Error {
  constructor() {
    super("Membership details are temporarily unavailable.");
    this.name = "MembershipRepositoryError";
  }
}

export async function getCurrentMembership(
  profileId: string,
  now = new Date().toISOString(),
): Promise<CurrentMembership> {
  const { data, error } = await (await createClient())
    .from("reporter_profiles")
    .select("public_status, membership_expires_at, membership_grace_ends_at, can_publish_directly, can_broadcast_live")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error || !data) throw new MembershipRepositoryError();

  const status = membershipStatusAt({
    publicStatus: data.public_status,
    expiresAt: data.membership_expires_at,
    graceEndsAt: data.membership_grace_ends_at,
  }, now);
  return {
    status,
    access: membershipAccess({
      status,
      direct: data.can_publish_directly,
      live: data.can_broadcast_live,
    }),
    membershipExpiresAt: data.membership_expires_at,
    membershipGraceEndsAt: data.membership_grace_ends_at,
    canPublishDirectly: data.can_publish_directly,
    canBroadcastLive: data.can_broadcast_live,
  };
}
