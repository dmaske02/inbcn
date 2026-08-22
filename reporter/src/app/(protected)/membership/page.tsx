import { membershipAccess, membershipStatusAt } from "@inbcn/domain";

import { env } from "@/config/env";
import { requireReporterSession } from "@/features/auth/server";
import { getCurrentMembership } from "@/features/membership/membership.repository";
import { RenewalCheckout } from "@/features/membership/renewal-checkout";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" })
    .format(new Date(value));
}

export default async function MembershipPage() {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") {
    return (
      <section className="rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reporter membership</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Membership becomes available after an administrator approves your application.
        </p>
      </section>
    );
  }

  const membership = await getCurrentMembership(actor.userId);
  // Membership truth is derived from server time and database dates, never browser state.
  const status = membershipStatusAt({
    publicStatus: membership.status,
    expiresAt: membership.membershipExpiresAt,
    graceEndsAt: membership.membershipGraceEndsAt,
  }, new Date().toISOString());
  const access = membershipAccess({
    status,
    direct: membership.canPublishDirectly,
    live: membership.canBroadcastLive,
  });
  const suspended = status === "suspended";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Reporter account</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Membership</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Status: <span className="font-medium text-foreground">{status.replaceAll("_", " ")}</span>
        </p>
      </header>

      <section className="grid gap-4 rounded-lg border border-border bg-background p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Paid membership expires</h2>
          <p className="mt-1 text-lg font-semibold">{date(membership.membershipExpiresAt)}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Seven-day grace ends</h2>
          <p className="mt-1 text-lg font-semibold">{date(membership.membershipGraceEndsAt)}</p>
        </div>
        <div className="sm:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">Current access</h2>
          <p className="mt-1 text-sm">{access.replaceAll("-", " ")}</p>
          {status === "grace_period" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              During grace, every submission requires editorial review regardless of trust flags.
            </p>
          ) : null}
          {status === "expired" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Expired membership is read-only until a renewal is captured.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-background p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Renew membership</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A captured ₹100 payment adds one year. The server applies membership dates after verification.
          </p>
        </div>
        {suspended ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            Renewal is unavailable while reporter access is suspended.
          </p>
        ) : null}
        <RenewalCheckout disabled={suspended} keyId={env.public.razorpayKeyId} />
      </section>
    </div>
  );
}
