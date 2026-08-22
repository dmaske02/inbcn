import Link from "next/link";

import { getCurrentApplication } from "@/features/application/application.repository";
import { requireReporterSession } from "@/features/auth/server";
import { getCurrentMembership } from "@/features/membership/membership.repository";

export default async function DashboardPage() {
  const actor = await requireReporterSession();
  const application = actor.state === "applicant"
    ? await getCurrentApplication(actor.userId)
    : null;
  const membership = actor.state === "reporter"
    ? await getCurrentMembership(actor.userId)
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reporter dashboard</h1>
        {membership ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Membership status: {membership.status.replaceAll("_", " ")}. Current access: {membership.access.replaceAll("-", " ")}.
            </p>
            <Link className="mt-4 inline-flex text-sm font-medium underline underline-offset-4" href="/membership">
              View membership and renew
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Application status: {application?.status.replaceAll("_", " ") ?? "not started"}.
            </p>
            <Link className="mt-4 inline-flex text-sm font-medium underline underline-offset-4" href="/application">
              {application ? "View application" : "Start reporter application"}
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
