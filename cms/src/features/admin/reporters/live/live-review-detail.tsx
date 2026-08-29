"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { LiveReviewRequest } from "./live-review.repository";
import {
  approveLiveRequestAction,
  rejectLiveRequestAction,
  terminateLiveRequestAction,
  type LiveReviewActionState,
} from "./live-review.actions";

const initialState: LiveReviewActionState = { status: "idle" };
const inputClass = (invalid = false) =>
  `mt-2 min-h-11 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base transition-colors sm:text-sm ${invalid ? "border-destructive focus-visible:ring-destructive" : "border-input"}`;

function StateMessage({ state, pending }: Readonly<{ state: LiveReviewActionState; pending: boolean }>) {
  const message = pending ? "Saving…" : state.message;
  if (!message) return null;
  return (
    <p
      aria-live="polite"
      className={`rounded-md border p-3 text-sm ${state.status === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/50 text-muted-foreground"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function LiveReviewDetail({ request, canDecide }: Readonly<{ request: LiveReviewRequest; canDecide: boolean }>) {
  const approve = approveLiveRequestAction.bind(null, request.id);
  const reject = rejectLiveRequestAction.bind(null, request.id);
  const terminate = terminateLiveRequestAction.bind(null, request.id);
  const [approveState, approveAction, approvePending] = useActionState(approve, initialState);
  const [rejectState, rejectAction, rejectPending] = useActionState(reject, initialState);
  const [terminateState, terminateAction, terminatePending] = useActionState(terminate, initialState);
  const [startInvalid, setStartInvalid] = useState(false);
  const [endInvalid, setEndInvalid] = useState(false);
  const statusVariant = request.status === "approved" ? "verified" : request.status === "pending" ? "signal" : "outline";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:flex sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:space-y-0">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live request</p>
            <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight">{request.title}</h1>
          </div>
          <Badge className="w-fit shrink-0 capitalize" variant={statusVariant}>{request.status.replaceAll("_", " ")}</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            <div className="space-y-1"><dt className="font-medium text-muted-foreground">Purpose</dt><dd className="whitespace-pre-wrap">{request.purpose}</dd></div>
            <div className="space-y-1"><dt className="font-medium text-muted-foreground">Intended locality</dt><dd>{request.intendedLocality}</dd></div>
            <div className="space-y-1"><dt className="font-medium text-muted-foreground">Expected start</dt><dd><time dateTime={request.expectedStartsAt}>{date(request.expectedStartsAt)}</time></dd></div>
            <div className="space-y-1"><dt className="font-medium text-muted-foreground">Requested duration</dt><dd>{request.expectedDurationMinutes} minutes</dd></div>
          </dl>
          {request.supportingNotes ? (
            <aside className="rounded-md border border-border bg-muted/40 p-4" aria-label="Private newsroom notes">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Private newsroom notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{request.supportingNotes}</p>
            </aside>
          ) : null}
          {request.approvedStartsAt && request.approvedEndsAt ? <p className="text-sm"><span className="font-medium">Approved window:</span> {date(request.approvedStartsAt)} – {date(request.approvedEndsAt)}.</p> : null}
          {request.decisionReason ? <p className="text-sm"><span className="font-medium">Decision reason:</span> {request.decisionReason}</p> : null}
          {request.terminationReason ? <p className="text-sm"><span className="font-medium">Termination reason:</span> {request.terminationReason}</p> : null}
        </CardContent>
      </Card>

      {canDecide && request.status === "pending" ? (
        <section aria-labelledby="editorial-decision-heading" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight" id="editorial-decision-heading">Editorial decision</h2>
            <p className="mt-1 text-sm text-muted-foreground">Approve a precise broadcast window or reject the request with a newsroom reason.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <form action={approveAction}>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Approval</h3>
                  <p className="text-sm text-muted-foreground">Set the exact IST window authorized for this broadcast.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="block text-sm font-medium" htmlFor="approved-start">
                    Approved start (IST)
                    <input
                      aria-describedby={startInvalid ? "approved-start-error approval-window-help" : "approval-window-help"}
                      aria-invalid={startInvalid}
                      className={inputClass(startInvalid)}
                      id="approved-start"
                      name="approvedStartsAt"
                      onInput={(event) => setStartInvalid(!event.currentTarget.validity.valid)}
                      onInvalid={() => setStartInvalid(true)}
                      required
                      type="datetime-local"
                    />
                  </label>
                  {startInvalid ? <p className="text-sm text-destructive" id="approved-start-error">Please enter a complete date and time.</p> : null}
                  <label className="block text-sm font-medium" htmlFor="approved-end">
                    Approved end (IST)
                    <input
                      aria-describedby={endInvalid ? "approved-end-error approval-window-help" : "approval-window-help"}
                      aria-invalid={endInvalid}
                      className={inputClass(endInvalid)}
                      id="approved-end"
                      name="approvedEndsAt"
                      onInput={(event) => setEndInvalid(!event.currentTarget.validity.valid)}
                      onInvalid={() => setEndInvalid(true)}
                      required
                      type="datetime-local"
                    />
                  </label>
                  {endInvalid ? <p className="text-sm text-destructive" id="approved-end-error">Please enter a complete date and time.</p> : null}
                  <p className="text-xs text-muted-foreground" id="approval-window-help">The window must be positive and no longer than the requested duration.</p>
                  <StateMessage pending={approvePending} state={approveState} />
                </CardContent>
                <CardFooter className="border-t border-border pt-5 sm:pt-6">
                  <Button className="w-full sm:w-auto" disabled={approvePending} type="submit">{approvePending ? "Approving…" : "Approve live request"}</Button>
                </CardFooter>
              </form>
            </Card>

            <Card>
              <form action={rejectAction}>
                <CardHeader>
                  <h3 className="text-lg font-semibold">Rejection</h3>
                  <p className="text-sm text-muted-foreground">Record a clear editorial reason before rejecting this request.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="block text-sm font-medium" htmlFor="rejection-reason">
                    Decision reason
                    <textarea aria-describedby="rejection-help" className={inputClass()} id="rejection-reason" maxLength={2000} minLength={1} name="reason" required rows={5} />
                  </label>
                  <p className="text-xs text-muted-foreground" id="rejection-help">Required. This reason is retained with the editorial decision.</p>
                  <StateMessage pending={rejectPending} state={rejectState} />
                </CardContent>
                <CardFooter className="border-t border-border pt-5 sm:pt-6">
                  <Button className="w-full sm:w-auto" disabled={rejectPending} type="submit" variant="destructive">{rejectPending ? "Rejecting…" : "Reject live request"}</Button>
                </CardFooter>
              </form>
            </Card>
          </div>
        </section>
      ) : null}

      {canDecide && (request.status === "approved" || request.status === "terminated") ? (
        <section className="rounded-md border border-border p-5 lg:p-6">
          <form action={terminateAction} className="space-y-4">
            <h2 className="text-lg font-semibold">{request.status === "terminated" ? "Retry provider cleanup" : "Terminate request"}</h2>
            <p className="text-sm text-muted-foreground">This ends the database workflow before revoking the reporter and deleting the exact LiveKit room. If provider cleanup is uncertain, the terminated decision remains authoritative and cleanup can be retried.</p>
            {request.status === "approved" ? <label className="block text-sm font-medium" htmlFor="termination-reason">Termination reason<textarea className={inputClass()} id="termination-reason" maxLength={2000} minLength={1} name="reason" required rows={4} /></label> : <input name="reason" type="hidden" value={request.terminationReason ?? "Retry provider cleanup"} />}
            <Button disabled={terminatePending} type="submit" variant="destructive">{request.status === "terminated" ? "Retry provider cleanup" : "Terminate live request"}</Button>
            <StateMessage pending={terminatePending} state={terminateState} />
          </form>
        </section>
      ) : null}
      {!canDecide ? <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">Editors can review this request, but only administrators can make decisions.</p> : null}
    </div>
  );
}
