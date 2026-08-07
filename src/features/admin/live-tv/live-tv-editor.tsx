import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LiveTvForm } from "./live-tv-form";
import type { getLiveTvEditorView } from "./live-tv.service";

type EditorView = Awaited<ReturnType<typeof getLiveTvEditorView>>;

export function LiveTvEditor({ view, notices = {} }: { view: EditorView; notices?: { saved?: string; changed?: string; error?: string } }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-muted-foreground">Editorial CMS</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Live TV</h1><p className="mt-2 text-sm text-muted-foreground">Manage localized channels, programmes, providers, and broadcast schedules.</p></div>
        <Link className={buttonVariants()} href="/admin/live-tv"><Plus aria-hidden="true" />New channel</Link>
      </header>
      {notices.saved || notices.changed ? <p className="rounded-md border border-verified/30 bg-verified/5 p-3 text-sm text-verified" role="status">Live TV changes were saved successfully.</p> : null}
      {notices.error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">The requested Live TV action could not be completed.</p> : null}
      <div className="grid items-start gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-6" padding="none">
          <CardHeader><h2 className="text-base font-semibold">Channels</h2><p className="text-sm text-muted-foreground">{view.items.length} localized configuration{view.items.length === 1 ? "" : "s"}</p></CardHeader>
          <CardContent className="grid gap-2">
            {view.items.length ? view.items.map((item) => (
              <Link className={`rounded-md border p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${view.selected?.id === item.id ? "border-primary bg-primary/5" : "border-border"}`} href={`/admin/live-tv?id=${item.id}`} key={item.id}>
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{item.internalName}</span><Badge className="capitalize" variant="outline">{item.status}</Badge></span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.languageName} · {item.provider.toUpperCase()}</span>
              </Link>
            )) : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No Live TV channels yet. Create the first localized configuration.</p>}
          </CardContent>
        </Card>
        <LiveTvForm view={view} />
      </div>
    </div>
  );
}
