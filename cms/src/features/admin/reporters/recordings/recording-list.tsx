import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { RecordingListItem } from "./recording.model";

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function RecordingList({ recordings }: Readonly<{ recordings: readonly RecordingListItem[] }>) {
  if (recordings.length === 0) {
    return <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No completed or failed recordings need review.</p>;
  }
  return (
    <div className="space-y-3">
      {recordings.map((recording) => (
        <Card key={recording.id}>
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link className="font-semibold underline-offset-4 hover:underline" href={`/admin/reporters/recordings/${recording.id}`}>
                  {recording.requestTitle}
                </Link>
                <p className="mt-1 text-sm text-muted-foreground">
                  {recording.requestLocality} · ended {date(recording.recordingEndedAt)}
                </p>
              </div>
              <div className="flex gap-2 text-xs font-semibold">
                <span className="rounded-sm border border-border px-2 py-1 capitalize">{recording.recordingStatus}</span>
                <span className="rounded-sm border border-border px-2 py-1 capitalize">{recording.replayStatus}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
