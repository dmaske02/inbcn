"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { LiveReviewRequest } from "./live-review.repository";
import { approveLiveRequestAction, rejectLiveRequestAction, terminateLiveRequestAction, type LiveReviewActionState } from "./live-review.actions";

const initialState: LiveReviewActionState = { status: "idle" };
const inputClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2";

function StateMessage({ state, pending }: Readonly<{ state: LiveReviewActionState; pending: boolean }>) {
  return <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role="status">{pending ? "Saving…" : state.message ?? ""}</p>;
}

function date(value: string): string { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }

export function LiveReviewDetail({ request, canDecide }: Readonly<{ request: LiveReviewRequest; canDecide: boolean }>) {
  const approve = approveLiveRequestAction.bind(null, request.id);
  const reject = rejectLiveRequestAction.bind(null, request.id);
  const terminate = terminateLiveRequestAction.bind(null, request.id);
  const [approveState, approveAction, approvePending] = useActionState(approve, initialState);
  const [rejectState, rejectAction, rejectPending] = useActionState(reject, initialState);
  const [terminateState, terminateAction, terminatePending] = useActionState(terminate, initialState);
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-border bg-card p-5 lg:p-6">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{request.title}</h1><span className="rounded-sm border border-border px-2 py-1 text-xs font-semibold">{request.status.replaceAll("_", " ")}</span></div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Purpose</dt><dd>{request.purpose}</dd></div>
          <div><dt className="text-muted-foreground">Intended locality</dt><dd>{request.intendedLocality}</dd></div>
          <div><dt className="text-muted-foreground">Expected start</dt><dd>{date(request.expectedStartsAt)}</dd></div>
          <div><dt className="text-muted-foreground">Requested duration</dt><dd>{request.expectedDurationMinutes} minutes</dd></div>
        </dl>
        {request.supportingNotes ? <p className="mt-5 text-sm"><span className="font-medium">Private notes:</span> {request.supportingNotes}</p> : null}
        {request.approvedStartsAt && request.approvedEndsAt ? <p className="mt-5 text-sm">Approved window: {date(request.approvedStartsAt)} – {date(request.approvedEndsAt)}.</p> : null}
        {request.decisionReason ? <p className="mt-3 text-sm">Decision reason: {request.decisionReason}</p> : null}
        {request.terminationReason ? <p className="mt-3 text-sm">Termination reason: {request.terminationReason}</p> : null}
      </section>
      {canDecide && request.status === "pending" ? <section className="grid gap-6 rounded-md border border-border p-5 lg:grid-cols-2 lg:p-6">
        <form action={approveAction} className="space-y-4"><h2 className="text-lg font-semibold">Approve</h2><label className="block text-sm font-medium" htmlFor="approved-start">Approved start (IST)<input className={inputClass} id="approved-start" name="approvedStartsAt" required type="datetime-local" /></label><label className="block text-sm font-medium" htmlFor="approved-end">Approved end (IST)<input className={inputClass} id="approved-end" name="approvedEndsAt" required type="datetime-local" /></label><p className="text-xs text-muted-foreground">The window must be positive and no longer than the requested duration.</p><Button disabled={approvePending} type="submit">Approve live request</Button><StateMessage pending={approvePending} state={approveState} /></form>
        <form action={rejectAction} className="space-y-4"><h2 className="text-lg font-semibold">Reject</h2><label className="block text-sm font-medium" htmlFor="rejection-reason">Decision reason<textarea className={inputClass} id="rejection-reason" maxLength={2000} minLength={1} name="reason" required rows={4} /></label><Button disabled={rejectPending} type="submit" variant="destructive">Reject live request</Button><StateMessage pending={rejectPending} state={rejectState} /></form>
      </section> : null}
      {canDecide && (request.status === "approved" || request.status === "terminated") ? <section className="rounded-md border border-border p-5 lg:p-6"><form action={terminateAction} className="space-y-4"><h2 className="text-lg font-semibold">{request.status === "terminated" ? "Retry provider cleanup" : "Terminate request"}</h2><p className="text-sm text-muted-foreground">This ends the database workflow before revoking the reporter and deleting the exact LiveKit room. If provider cleanup is uncertain, the terminated decision remains authoritative and cleanup can be retried.</p>{request.status === "approved" ? <label className="block text-sm font-medium" htmlFor="termination-reason">Termination reason<textarea className={inputClass} id="termination-reason" maxLength={2000} minLength={1} name="reason" required rows={4} /></label> : <input name="reason" type="hidden" value={request.terminationReason ?? "Retry provider cleanup"} />}<Button disabled={terminatePending} type="submit" variant="destructive">{request.status === "terminated" ? "Retry provider cleanup" : "Terminate live request"}</Button><StateMessage pending={terminatePending} state={terminateState} /></form></section> : null}
      {!canDecide ? <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">Editors can review this request, but only administrators can make decisions.</p> : null}
    </div>
  );
}
