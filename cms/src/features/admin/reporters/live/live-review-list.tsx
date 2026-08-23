import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { LiveReviewRequest } from "./live-review.repository";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function LiveReviewList({ requests }: Readonly<{ requests: readonly LiveReviewRequest[] }>) {
  if (!requests.length) return <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No live requests to review.</p>;
  return <div className="space-y-3">{requests.map((request) => (
    <Card key={request.id}><CardContent>
      <Link className="font-semibold underline-offset-4 hover:underline" href={`/admin/reporters/live/${request.id}`}>{request.title}</Link>
      <p className="mt-1 text-sm text-muted-foreground">{request.status.replaceAll("_", " ")} · {request.intendedLocality} · requested for {date(request.expectedStartsAt)}</p>
    </CardContent></Card>
  ))}</div>;
}
