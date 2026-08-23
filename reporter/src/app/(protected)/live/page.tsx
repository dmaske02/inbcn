import Link from "next/link";

import { requireReporterSession } from "@/features/auth/server";
import { getLiveRequests } from "@/features/live/live-request.service";
import { LiveRequestList } from "@/features/live/live-request-list";

export default async function ReporterLivePage() {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") return <p className="text-sm text-muted-foreground">Live broadcast requests become available after reporter approval.</p>;
  const requests = await getLiveRequests(actor.userId);
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Live broadcasts</h1>
          <p className="mt-2 text-sm text-muted-foreground">Request a reviewed live window and follow its editorial decision here.</p>
        </div>
        <Link className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background" href="/live/request">Request live</Link>
      </header>
      <LiveRequestList requests={requests} />
    </div>
  );
}
