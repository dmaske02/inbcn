import Link from "next/link";

import { requireReporterSession } from "@/features/auth/server";
import { getLiveRequests } from "@/features/live/live-request.service";
import { LiveRequestList } from "@/features/live/live-request-list";

export default async function ReporterLivePage() {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") return <p className="text-sm text-muted-foreground">Live broadcast requests become available after reporter approval.</p>;
  const requests = await getLiveRequests(actor.userId);
  const currentTime = new Date().getTime();
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Reporter workspace</p>
          <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">Live</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Request an editorially reviewed broadcast window and follow each decision.</p>
        </div>
        <Link className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-md border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto" href="/live/request">Request live broadcast</Link>
      </header>
      <section aria-labelledby="live-history-heading" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight" id="live-history-heading">Requests and broadcast windows</h2>
          <p className="mt-1 text-sm text-muted-foreground">Editorial decisions and approved studio access appear here.</p>
        </div>
        <LiveRequestList currentTime={currentTime} requests={requests} />
      </section>
    </div>
  );
}
