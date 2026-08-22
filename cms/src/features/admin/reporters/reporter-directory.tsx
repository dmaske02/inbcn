"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApplicationReview } from "./application-review";
import { setReporterTrustAction, type ReporterActionState } from "./reporter.actions";
import type {
  ReporterApplicationDetail,
  ReporterDirectoryItem,
} from "./reporter.repository";

const initialState: ReporterActionState = { status: "idle" };
const inputClass = "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2";

function effectiveTrust(
  reporter: Pick<ReporterDirectoryItem, "isActive" | "publicStatus" | "membershipStartedAt" | "membershipExpiresAt" | "accessSyncStatus" | "accessSyncDesiredRole">,
  raw: boolean,
  now: string,
): boolean {
  return raw
    && reporter.isActive
    && reporter.publicStatus === "active"
    && reporter.membershipStartedAt <= now
    && reporter.membershipExpiresAt >= now
    && reporter.accessSyncStatus === "succeeded"
    && reporter.accessSyncDesiredRole === "reporter";
}

export function ReporterDirectory({
  reporters,
  now,
}: Readonly<{ reporters: readonly ReporterDirectoryItem[]; now: string }>) {
  if (reporters.length === 0) {
    return <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No approved reporters are available.</p>;
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {reporters.map((reporter) => (
        <li className="rounded-md border border-border bg-card p-5" key={reporter.profileId}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{reporter.legalName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">/{reporter.publicSlug} · {reporter.homeCity}, {reporter.homeDistrict}, {reporter.homeState}</p>
            </div>
            <Badge variant={reporter.isActive && reporter.publicStatus === "active" ? "verified" : "outline"}>
              {reporter.isActive ? reporter.publicStatus.replaceAll("_", " ") : "inactive"}
            </Badge>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Membership expires</dt><dd>{new Date(reporter.membershipExpiresAt).toLocaleDateString("en-IN")}</dd></div>
            <div><dt className="text-muted-foreground">Grace ends</dt><dd>{new Date(reporter.membershipGraceEndsAt).toLocaleDateString("en-IN")}</dd></div>
            <div><dt className="text-muted-foreground">Direct publish</dt><dd>{reporter.canPublishDirectly ? "raw enabled" : "raw disabled"} · {effectiveTrust(reporter, reporter.canPublishDirectly, now) ? "effective" : "not effective"}</dd></div>
            <div><dt className="text-muted-foreground">Live broadcast</dt><dd>{reporter.canBroadcastLive ? "raw enabled" : "raw disabled"} · {effectiveTrust(reporter, reporter.canBroadcastLive, now) ? "effective" : "not effective"}</dd></div>
          </dl>
          <Link className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })} href={`/admin/reporters/${reporter.profileId}`}>Manage reporter</Link>
        </li>
      ))}
    </ul>
  );
}

function ReporterTrustControls({
  application,
  now,
}: Readonly<{ application: ReporterApplicationDetail; now: string }>) {
  const action = setReporterTrustAction.bind(null, application.profileId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const reporter = application.reporter;
  if (!reporter) return null;
  const eligibility = {
    isActive: application.profile.isActive,
    publicStatus: reporter.publicStatus,
    membershipStartedAt: reporter.membershipStartedAt,
    membershipExpiresAt: reporter.membershipExpiresAt,
    accessSyncStatus: reporter.accessSyncStatus,
    accessSyncDesiredRole: reporter.accessSyncDesiredRole,
  };

  return (
    <section className="space-y-5 rounded-md border border-border p-5 lg:p-6">
      <div>
        <h2 className="text-lg font-semibold">Trust capabilities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enabling direct publication lets eligible future submissions bypass review. Live permission only allows requests; every live event still requires separate approval. Suspension resets both grants and reinstatement never restores them.
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Direct publication</dt><dd>Raw grant: {reporter.canPublishDirectly ? "enabled" : "disabled"}. Effective now: {effectiveTrust(eligibility, reporter.canPublishDirectly, now) ? "yes" : "no"}.</dd></div>
        <div><dt className="text-muted-foreground">Live broadcast requests</dt><dd>Raw grant: {reporter.canBroadcastLive ? "enabled" : "disabled"}. Effective now: {effectiveTrust(eligibility, reporter.canBroadcastLive, now) ? "yes" : "no"}.</dd></div>
      </dl>
      <form action={formAction} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm"><span className="font-medium">Capability</span><select className={inputClass} name="capability" required><option value="direct_publish">Direct publication</option><option value="live_broadcast">Live broadcast requests</option></select></label>
        <label className="grid gap-2 text-sm"><span className="font-medium">Explicit choice</span><select className={inputClass} name="enabled" required><option value="">Choose Enable or Disable</option><option value="true">Enable</option><option value="false">Disable</option></select></label>
        <label className="grid gap-2 text-sm md:col-span-2"><span className="font-medium">Reason</span><textarea className={inputClass} maxLength={2000} name="reason" required rows={4} /></label>
        <div className="space-y-2 md:col-span-2">
          <Button disabled={pending} type="submit">{pending ? "Updating…" : "Update trust"}</Button>
          <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role="status">{state.message ?? ""}</p>
        </div>
      </form>
    </section>
  );
}

export function ReporterDetail({
  application,
  now,
}: Readonly<{ application: ReporterApplicationDetail; now: string }>) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/admin/reporters">Back to reporter directory</Link>
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/admin/reporters/applications/${application.id}`}>Open application review</Link>
      </div>
      <ReporterTrustControls application={application} now={now} />
      <ApplicationReview application={application} />
    </div>
  );
}
