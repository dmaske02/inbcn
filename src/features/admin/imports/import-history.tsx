import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ImportButton } from "./import-button";
import type { ImportDashboardView } from "./ingestion.service";
import { pauseSchedulerAction, resumeSchedulerAction, runSchedulerNowAction } from "./ingestion.actions";
import { Button } from "@/components/ui/button";

function historyHref(page: number): string {
  return `/admin/imports?page=${page}`;
}

export function ImportHistory({
  view,
}: Readonly<{ view: ImportDashboardView }>) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="scheduler-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="scheduler-title">Scheduler</h2>
            <p className="mt-1 text-sm text-muted-foreground">Automated draft imports every {view.scheduler.intervalMinutes} minutes.</p>
          </div>
          <div className="flex gap-2">
            <form action={view.scheduler.enabled ? pauseSchedulerAction : resumeSchedulerAction}>
              <Button type="submit" variant="outline">{view.scheduler.enabled ? "Pause scheduler" : "Resume scheduler"}</Button>
            </form>
            <form action={runSchedulerNowAction}><Button type="submit">Run immediately</Button></form>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Status", view.scheduler.enabled ? "Running" : "Paused"],
            ["Currently running", view.scheduler.currentRun ? new Date(view.scheduler.currentRun).toLocaleString("en-IN") : "No"],
            ["Queue size", String(view.scheduler.queueSize)],
            ["Retry count", String(view.scheduler.retryCount)],
            ["Last run", view.scheduler.lastRun ? new Date(view.scheduler.lastRun).toLocaleString("en-IN") : "Never"],
            ["Next run", view.scheduler.nextRun ? new Date(view.scheduler.nextRun).toLocaleString("en-IN") : "Paused"],
            ["Imported today", String(view.scheduler.statistics.today)],
            ["Imported this week", String(view.scheduler.statistics.week)],
            ["Imported this month", String(view.scheduler.statistics.month)],
          ].map(([label, value]) => <Card key={label} padding="none"><CardContent className="py-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></CardContent></Card>)}
        </div>
        {view.scheduler.recentFailures.length > 0 ? <Card className="mt-4" padding="none"><CardHeader><h3 className="font-semibold">Recent failures</h3></CardHeader><CardContent><ul className="space-y-2 text-sm">{view.scheduler.recentFailures.map((failure) => <li key={failure.id}><span className="text-muted-foreground">{new Date(failure.at).toLocaleString("en-IN")}</span> — {failure.reason}</li>)}</ul></CardContent></Card> : null}
      </section>

      <section aria-labelledby="manual-import-title">
        <h2 className="text-xl font-semibold" id="manual-import-title">
          Manual import
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {view.sources.length === 0 ? (
            <Card className="border-dashed md:col-span-2" padding="none">
              <CardContent className="py-10 text-center">
                <p className="font-medium">No import source configured</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create one under Sources before running an import.
                </p>
              </CardContent>
            </Card>
          ) : (
            view.sources.map((source) => (
              <Card key={source.id} padding="none">
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{source.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {source.providerLabel} · {source.languageName} · {source.categoryName}
                      {source.country ? ` · ${source.country.toUpperCase()}` : ""}
                    </p>
                    {source.sourceType === "rss" && source.feedUrl ? (
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {source.feedUrl}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={source.isReady ? "secondary" : "outline"}>
                    {source.isReady ? "Ready" : "Unavailable"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {source.isReady ? (
                    <ImportButton sourceId={source.id} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Enable the source and configure its language and category.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="import-history-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="import-history-title">
              Import history
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.total} recorded runs
            </p>
          </div>
        </div>
        {view.runs.length === 0 ? (
          <Card className="mt-4 border-dashed" padding="none">
            <CardContent className="py-10 text-center">
              <p className="font-medium">No imports have run yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border border-border bg-background">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Imported</th>
                  <th className="p-3">Skipped</th>
                  <th className="p-3">Duplicate</th>
                  <th className="p-3">Failed</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.runs.map((run) => (
                  <tr className="align-top" key={run.id}>
                    <td className="whitespace-nowrap p-3">
                      {new Date(run.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 font-medium">{run.sourceName}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="capitalize">
                        {run.status}
                      </Badge>
                    </td>
                    <td className="p-3">{run.itemsCreated}</td>
                    <td className="p-3">{run.metadata.skipped}</td>
                    <td className="p-3">{run.metadata.duplicates}</td>
                    <td className="p-3">{run.itemsFailed}</td>
                    <td className="max-w-sm p-3 text-muted-foreground">
                      {run.errorMessage ??
                        run.metadata.details.find(
                          (detail) => detail.outcome === "failed",
                        )?.reason ??
                        "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Pagination
        currentPage={view.page}
        nextHref={
          view.page < view.totalPages ? historyHref(view.page + 1) : undefined
        }
        previousHref={view.page > 1 ? historyHref(view.page - 1) : undefined}
        totalPages={view.totalPages}
      />
    </div>
  );
}
