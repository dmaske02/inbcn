"use client";

import Image from "next/image";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveReporterAction,
  reinstateReporterAction,
  rejectReporterAction,
  retryReporterAccessSyncAction,
  suspendReporterAction,
  type ReporterActionState,
} from "./reporter.actions";
import type { ReporterApplicationDetail } from "./reporter.repository";

const initialState: ReporterActionState = { status: "idle" };
const inputClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2";

function StateMessage({ state, pending }: Readonly<{
  state: ReporterActionState;
  pending: boolean;
}>) {
  return (
    <p
      aria-live="polite"
      className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      role="status"
    >
      {pending ? "Saving…" : state.message ?? ""}
    </p>
  );
}

export function ApplicationReview({ application }: Readonly<{
  application: ReporterApplicationDetail;
}>) {
  const approve = approveReporterAction.bind(null, application.id);
  const reject = rejectReporterAction.bind(null, application.id);
  const suspend = suspendReporterAction.bind(null, application.id, application.profileId);
  const reinstate = reinstateReporterAction.bind(null, application.id, application.profileId);
  const retryAccess = retryReporterAccessSyncAction.bind(null, application.id, application.profileId);
  const [approveState, approveAction, approvePending] = useActionState(approve, initialState);
  const [rejectState, rejectAction, rejectPending] = useActionState(reject, initialState);
  const [suspendState, suspendAction, suspendPending] = useActionState(suspend, initialState);
  const [reinstateState, reinstateAction, reinstatePending] = useActionState(reinstate, initialState);
  const [retryState, retryAction, retryPending] = useActionState(retryAccess, initialState);
  const paymentReady = application.payment?.status === "captured"
    && application.payment.amountPaise === 10_000
    && application.payment.currency === "INR";
  const currentConsents = new Set(application.consents
    .filter((consent) => consent.version === "1.0" && consent.withdrawnAt === null)
    .map((consent) => consent.key));
  const consentsReady = currentConsents.size === 6;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 rounded-md border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{application.legalName}</h1>
            <Badge variant="outline">{application.status.replaceAll("_", " ")}</Badge>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Account</dt><dd>{application.profile.displayName} · @{application.profile.username}</dd></div>
            <div><dt className="text-muted-foreground">Date of birth</dt><dd>{application.dateOfBirth}</dd></div>
            <div><dt className="text-muted-foreground">Location</dt><dd>{application.homeCity}, {application.homeDistrict}, {application.homeState}</dd></div>
            <div><dt className="text-muted-foreground">Beats</dt><dd>{application.beats.join(", ") || "None supplied"}</dd></div>
            <div><dt className="text-muted-foreground">KYC result</dt><dd>{application.kycStatus}; adult: {application.verifiedAdult === true ? "verified" : "not verified"}</dd></div>
            <div><dt className="text-muted-foreground">Verified legal name</dt><dd>{application.verifiedLegalName ?? "Unavailable"}</dd></div>
          </dl>
          {application.bio ? <p className="text-sm text-muted-foreground">{application.bio}</p> : null}
        </div>
        <figure>
          <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
            <Image
              alt={`Separately supplied public portrait for ${application.legalName}`}
              className="object-cover"
              fill
              sizes="(max-width: 1024px) 100vw, 320px"
              src={application.publicPhotoUrl}
            />
          </div>
          <figcaption className="mt-2 text-xs text-muted-foreground">
            Public portrait only. KYC or Aadhaar imagery is never shown or published.
          </figcaption>
        </figure>
      </section>

      <section className="rounded-md border border-border p-5 lg:p-6">
        <h2 className="text-lg font-semibold">Approval evidence</h2>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <li>{paymentReady ? "✓" : "✕"} Exact ₹100 captured payment</li>
          <li>{application.verifiedAdult === true ? "✓" : "✕"} Adult status verified</li>
          <li>{application.verifiedLegalName ? "✓" : "✕"} Legal name verified</li>
          <li>{consentsReady ? "✓" : "✕"} All six current consent versions</li>
        </ul>
        <div className="mt-5 space-y-2">
          <h3 className="font-medium">Consent receipts</h3>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {application.consents.map((consent) => (
              <li key={`${consent.key}:${consent.version}`}>
                {consent.key.replaceAll("_", " ")} · v{consent.version} · {consent.locale}
                {consent.withdrawnAt ? " · withdrawn" : ""}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {application.status === "under_review" ? (
        <section className="grid gap-6 rounded-md border border-border p-5 lg:grid-cols-2 lg:p-6">
          <form action={approveAction} className="space-y-4">
            <h2 className="text-lg font-semibold">Approve</h2>
            <label className="flex items-start gap-3 text-sm">
              <input className="mt-1 size-4" name="publicPhotoIdentityMatch" required type="checkbox" />
              <span>I compared this separate public portrait with the verified applicant and confirm the identity match.</span>
            </label>
            <Button disabled={approvePending || !paymentReady || !consentsReady} type="submit">Approve reporter</Button>
            <StateMessage pending={approvePending} state={approveState} />
          </form>
          <form action={rejectAction} className="space-y-4">
            <h2 className="text-lg font-semibold">Reject and refund</h2>
            <label className="block text-sm" htmlFor="rejection-reason">Decision reason</label>
            <textarea className={inputClass} id="rejection-reason" name="reason" required rows={4} />
            <Button disabled={rejectPending} type="submit" variant="destructive">Reject and refund ₹100</Button>
            <StateMessage pending={rejectPending} state={rejectState} />
          </form>
        </section>
      ) : null}

      {application.payment && application.status === "rejected" ? (
        <section className="rounded-md border border-border p-5 lg:p-6">
          <h2 className="text-lg font-semibold">Refund status</h2>
          <p className="mt-2 text-sm">{application.payment.refundStatus.replaceAll("_", " ")}</p>
          {application.payment.refundFailureDetail ? <p className="mt-1 text-sm text-destructive">{application.payment.refundFailureDetail}</p> : null}
          {application.payment.refundStatus !== "refunded" ? (
            <form action={rejectAction} className="mt-4 space-y-2">
              <input name="reason" type="hidden" value={application.decisionReason ?? "Administrator rejection"} />
              <Button disabled={rejectPending} type="submit" variant="outline">Retry full refund</Button>
              <StateMessage pending={rejectPending} state={rejectState} />
            </form>
          ) : null}
        </section>
      ) : null}

      {application.reporter ? (
        <section className="space-y-5 rounded-md border border-border p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Reporter access</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Membership {application.reporter.publicStatus}; expires {new Date(application.reporter.membershipExpiresAt).toLocaleDateString("en-IN")}; grace ends {new Date(application.reporter.membershipGraceEndsAt).toLocaleDateString("en-IN")}.
              </p>
            </div>
            <Badge variant={application.reporter.accessSyncStatus === "succeeded" ? "verified" : "signal"}>
              access sync {application.reporter.accessSyncStatus} · generation {application.reporter.accessSyncGeneration}
            </Badge>
          </div>
          <p className="text-sm">
            Direct publish: {application.reporter.canPublishDirectly ? "enabled" : "disabled"}. Live: {application.reporter.canBroadcastLive ? "enabled" : "disabled"}.
          </p>
          <p className="text-sm text-muted-foreground">
            Current signed-role target: {application.reporter.accessSyncDesiredRole === "reporter" ? "reporter" : "no reporter role"}.
            {application.reporter.accessSyncClaimedAt ? " A synchronization lease is currently recorded." : ""}
          </p>
          {application.reporter.accessSyncFailureDetail ? (
            <p className="text-sm text-destructive" role="alert">
              The signed role update failed. Database access remains denied until an administrator retries synchronization.
            </p>
          ) : null}
          {application.reporter.accessSyncStatus !== "succeeded" ? (
            <form action={retryAction} className="space-y-2">
              <Button disabled={retryPending} type="submit" variant="outline">Retry signed access sync</Button>
              <StateMessage pending={retryPending} state={retryState} />
            </form>
          ) : null}
          {application.reporter.publicStatus === "suspended" ? (
            <form action={reinstateAction} className="space-y-2">
              <p className="text-sm text-muted-foreground">{application.reporter.suspensionReason}</p>
              <Button disabled={reinstatePending} type="submit">Reinstate without trust flags</Button>
              <StateMessage pending={reinstatePending} state={reinstateState} />
            </form>
          ) : (
            <form action={suspendAction} className="space-y-3">
              <label className="block text-sm" htmlFor="suspension-reason">Suspension reason</label>
              <textarea className={inputClass} id="suspension-reason" name="reason" required rows={3} />
              <Button disabled={suspendPending} type="submit" variant="destructive">Suspend access</Button>
              <StateMessage pending={suspendPending} state={suspendState} />
            </form>
          )}
          <p className="text-xs text-muted-foreground">
            Supabase does not support refresh-token or session deletion by user ID. Suspension disables database access immediately; the current generation separately tracks signed app_metadata synchronization. Existing JWTs remain until expiry but are denied by the inactive database gate.
          </p>
        </section>
      ) : null}

      {application.audit.length ? (
        <section className="rounded-md border border-border p-5 lg:p-6">
          <h2 className="text-lg font-semibold">Decision audit</h2>
          <ol className="mt-4 space-y-2 text-sm">
            {application.audit.map((event, index) => (
              <li key={`${event.action}:${event.createdAt}:${index}`}>
                {event.action} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("en-IN")}</time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
