import { notFound } from "next/navigation";

import { requireReporterSession } from "@/features/auth/server";
import { ReporterBroadcastStudio } from "@/features/live/components/reporter-broadcast-studio";
import { getLiveRequest } from "@/features/live/live-request.service";
import { getCurrentMembership } from "@/features/membership/membership.repository";

export default async function ReporterLiveStudioPage({ params }: Readonly<{ params: Promise<{ requestId: string }> }>) {
  const actor = await requireReporterSession();
  const { requestId } = await params;
  if (actor.state !== "reporter") notFound();
  let request;
  let membership;
  try {
    [request, membership] = await Promise.all([getLiveRequest(actor.userId, requestId), getCurrentMembership(actor.userId)]);
  } catch { notFound(); }
  const startsAt = request?.approvedStartsAt ? Date.parse(request.approvedStartsAt) : Number.NaN;
  const endsAt = request?.approvedEndsAt ? Date.parse(request.approvedEndsAt) : Number.NaN;
  const now = new Date().getTime();
  if (!request || request.status !== "approved" || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)
    || membership.status !== "active" || !membership.canBroadcastLive || now < startsAt || now >= endsAt) notFound();
  return <ReporterBroadcastStudio requestId={request.id} />;
}
