import type { ReporterLiveRequest } from "./live-request.repository";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function LiveRequestList({ requests }: Readonly<{ requests: readonly ReporterLiveRequest[] }>) {
  if (!requests.length) return <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No live broadcast requests yet.</p>;
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li className="rounded-lg border border-border bg-background p-5 shadow-sm" key={request.id}>
          <h2 className="font-semibold">{request.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{request.status.replaceAll("_", " ")} · requested for {date(request.expectedStartsAt)}</p>
          {request.status === "approved" && request.approvedStartsAt && request.approvedEndsAt ? <p className="mt-2 text-sm">Approved window: {date(request.approvedStartsAt)} – {date(request.approvedEndsAt)}.</p> : null}
          {request.decisionReason ? <p className="mt-2 text-sm">Editorial note: {request.decisionReason}</p> : null}
          {request.terminationReason ? <p className="mt-2 text-sm">Termination note: {request.terminationReason}</p> : null}
        </li>
      ))}
    </ul>
  );
}
