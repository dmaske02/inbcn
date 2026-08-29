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
      <Link className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/live">Back to live</Link>
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground">Live workspace</p>
        <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">Request a live broadcast</h1>
        <p className="mt-2 text-sm text-muted-foreground">Share the proposed broadcast details with the newsroom. Editorial approval sets the exact window, and approved broadcasts will be server-recorded.</p>
      </header>
      {!eligible ? <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="status">Your request history remains available, but grace, expired, suspended, disabled, or non-live-trusted accounts cannot create a live request.</p> : null}
      <LiveRequestForm eligible={eligible} />
    </div>
  );
}
