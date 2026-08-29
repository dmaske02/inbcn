import Link from "next/link";

import { Badge, type ReporterBadgeState } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ReporterLiveRequest } from "./live-request.repository";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function badgeState(status: string): ReporterBadgeState {
  if (status === "approved") return "approved";
  if (status === "pending") return "pending_review";
  return "rejected";
}

function statusLabel(status: string): string {
  if (status === "pending") return "Pending review";
  return status.replaceAll("_", " ");
}

function statusMessage(request: ReporterLiveRequest, now: number): string {
  if (request.status === "pending") return "Editorial approval is required before a broadcast studio becomes available.";
  if (request.status === "rejected") return "This request was not approved for broadcast.";
  if (request.status === "terminated") return "This broadcast window has been ended by the newsroom.";
  if (request.status !== "approved" || !request.approvedStartsAt || !request.approvedEndsAt) return "Follow the editorial status of this request here.";
  const startsAt = Date.parse(request.approvedStartsAt);
  const endsAt = Date.parse(request.approvedEndsAt);
  if (now < startsAt) return "Approved. The studio opens at the approved start time.";
  if (now >= endsAt) return "The approved broadcast window has ended.";
  return "The approved broadcast window is open now.";
}

export function LiveRequestList({ requests, currentTime }: Readonly<{ requests: readonly ReporterLiveRequest[]; currentTime: number }>) {
  if (!requests.length) return <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No live broadcast requests yet.</p>;
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id}>
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live request</p>
                  <h3 className="mt-1 break-words text-base font-semibold">{request.title}</h3>
                </div>
                <Badge className="w-fit shrink-0 capitalize" state={badgeState(request.status)}>{statusLabel(request.status)}</Badge>
              </div>

              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Intended locality</dt><dd className="mt-1 font-medium">{request.intendedLocality}</dd></div>
                <div><dt className="text-muted-foreground">Requested start</dt><dd className="mt-1 font-medium"><time dateTime={request.expectedStartsAt}>{date(request.expectedStartsAt)}</time></dd></div>
                <div><dt className="text-muted-foreground">Requested duration</dt><dd className="mt-1 font-medium">{request.expectedDurationMinutes} minutes</dd></div>
              </dl>

              {request.status === "approved" && request.approvedStartsAt && request.approvedEndsAt ? (
                <div className="border-t border-border pt-4 text-sm">
                  <p className="font-medium">Approved window</p>
                  <p className="mt-1 text-muted-foreground"><time dateTime={request.approvedStartsAt}>{date(request.approvedStartsAt)}</time> – <time dateTime={request.approvedEndsAt}>{date(request.approvedEndsAt)}</time></p>
                </div>
              ) : null}

              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground" role="status">{statusMessage(request, currentTime)}</p>
              {request.decisionReason ? <p className="text-sm"><span className="font-medium">Editorial note:</span> {request.decisionReason}</p> : null}
              {request.terminationReason ? <p className="text-sm"><span className="font-medium">Termination note:</span> {request.terminationReason}</p> : null}
              {request.status === "approved" ? <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto" href={`/live/${request.id}`}>Open broadcast studio</Link> : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
