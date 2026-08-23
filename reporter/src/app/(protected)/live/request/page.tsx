import Link from "next/link";

import { requireReporterSession } from "@/features/auth/server";
import { LiveRequestForm } from "@/features/live/live-request-form";
import { canRequestLive } from "@/features/live/live-request.model";
import { getCurrentMembership } from "@/features/membership/membership.repository";

export default async function LiveRequestPage() {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") return <p className="text-sm text-muted-foreground">Live broadcast requests become available after reporter approval.</p>;
  const membership = await getCurrentMembership(actor.userId);
  const eligible = canRequestLive({ membership: membership.status, canBroadcastLive: membership.canBroadcastLive });
  return (
    <div className="space-y-6">
      <Link className="inline-flex rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/live">Back to live broadcasts</Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Request a live broadcast</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Live trust and an active membership are required. General reporter trust never approves a specific event: editorial approval sets the broadcast window, and approved broadcasts will be server-recorded.</p>
      </header>
      {!eligible ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Your request history remains available, but grace, expired, suspended, disabled, or non-live-trusted accounts cannot create a live request.</p> : null}
      <LiveRequestForm eligible={eligible} />
    </div>
  );
}
