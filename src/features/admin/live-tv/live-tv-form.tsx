"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  createLiveTvAction,
  deleteLiveTvAction,
  updateLiveTvAction,
  type LiveTvActionState,
} from "./live-tv.actions";
import type { getLiveTvEditorView } from "./live-tv.service";

type EditorView = Awaited<ReturnType<typeof getLiveTvEditorView>>;
const initialState: LiveTvActionState = { status: "idle" };
const control = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

function utcDateTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

export function LiveTvForm({ view }: { view: EditorView }) {
  const stream = view.selected;
  const action = stream ? updateLiveTvAction.bind(null, stream.id) : createLiveTvAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [languageId, setLanguageId] = useState(stream?.languageId ?? view.references.languages[0]?.id ?? "");
  const [provider, setProvider] = useState(stream?.provider ?? "youtube");
  const categories = useMemo(
    () => view.references.categories.filter((item) => item.languageId === languageId),
    [languageId, view.references.categories],
  );
  const stories = useMemo(
    () => view.references.stories.filter((item) => item.languageId === languageId),
    [languageId, view.references.stories],
  );
  const locale = view.references.languages.find((item) => item.id === languageId)?.code ?? "en";
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5">
        <Card padding="none">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Channel settings</h2>
              <p className="text-sm text-muted-foreground">Configure one localized Live TV channel.</p>
            </div>
            <Badge className="capitalize" variant={stream ? "outline" : "secondary"}>
              {stream?.status ?? "New channel"}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Language *</span>
              <select className={control} name="languageId" onChange={(event) => setLanguageId(event.target.value)} value={languageId} required>
                {view.references.languages.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code.toUpperCase()})</option>)}
              </select>
              {fieldError("languageId") ? <span className="text-sm text-destructive">{fieldError("languageId")}</span> : null}
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Status *</span>
              <select className={control} defaultValue={stream?.status ?? "draft"} name="status" required>
                <option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="offline">Offline</option><option value="archived">Archived</option>
              </select>
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Stream title *</span>
              <input className={control} defaultValue={stream?.internalName ?? ""} name="streamTitle" required />
              <span className="text-xs text-muted-foreground">Internal channel name shown in the editorial workspace.</span>
              {fieldError("streamTitle") ? <span className="text-sm text-destructive">{fieldError("streamTitle")}</span> : null}
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Short description *</span>
              <textarea className={`${control} min-h-24 py-3`} defaultValue={stream?.offlineMessage ?? ""} name="shortDescription" required />
              <span className="text-xs text-muted-foreground">Used as the concise channel description and offline message.</span>
              {fieldError("shortDescription") ? <span className="text-sm text-destructive">{fieldError("shortDescription")}</span> : null}
            </label>
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader><h2 className="text-lg font-semibold">Provider</h2><p className="text-sm text-muted-foreground">URLs are checked against the provider allowlist from Task 1.</p></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Provider *</span>
              <select className={control} name="provider" onChange={(event) => setProvider(event.target.value as "youtube" | "hls")} value={provider} required>
                <option value="youtube">YouTube</option><option value="hls">HLS</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Provider URL *</span>
              <input className={control} defaultValue={stream?.providerUrl ?? ""} inputMode="url" name="providerUrl" placeholder={provider === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://approved-host.example/live.m3u8"} required type="url" />
              {provider === "hls" && view.allowedHlsHosts.length === 0 ? <span className="text-xs text-destructive">No HLS hosts are configured. Set LIVE_TV_HLS_ALLOWED_HOSTS before saving HLS.</span> : null}
              {fieldError("providerUrl") ? <span className="text-sm text-destructive">{fieldError("providerUrl")}</span> : null}
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3">
              <input defaultChecked={stream?.autoplay ?? false} name="autoplay" type="checkbox" /><span className="text-sm font-medium">Autoplay</span>
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3">
              <input defaultChecked={stream?.muted ?? true} name="muted" type="checkbox" /><span className="text-sm font-medium">Muted</span>
            </label>
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader><h2 className="text-lg font-semibold">Current programme</h2><p className="text-sm text-muted-foreground">Describe what viewers see in the Live TV hero.</p></CardHeader>
          <CardContent className="grid gap-5">
            <label className="grid gap-2"><span className="text-sm font-medium">Current programme *</span><input className={control} defaultValue={stream?.title ?? ""} name="currentProgramme" required />{fieldError("currentProgramme") ? <span className="text-sm text-destructive">{fieldError("currentProgramme")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Programme description *</span><textarea className={`${control} min-h-28 py-3`} defaultValue={stream?.description ?? ""} name="programmeDescription" required />{fieldError("programmeDescription") ? <span className="text-sm text-destructive">{fieldError("programmeDescription")}</span> : null}</label>
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader><h2 className="text-lg font-semibold">Artwork</h2><p className="text-sm text-muted-foreground">The poster is also the offline image until separate artwork is introduced by a future schema phase.</p></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 md:col-span-2"><span className="text-sm font-medium">Poster / offline image URL</span><input className={control} defaultValue={stream?.posterUrl ?? ""} inputMode="url" name="posterUrl" type="url" />{fieldError("posterUrl") ? <span className="text-sm text-destructive">{fieldError("posterUrl")}</span> : null}</label>
            <label className="grid gap-2 md:col-span-2"><span className="text-sm font-medium">Poster alternative text</span><input className={control} defaultValue={stream?.posterAltText ?? ""} name="posterAltText" />{fieldError("posterAltText") ? <span className="text-sm text-destructive">{fieldError("posterAltText")}</span> : null}</label>
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader><h2 className="text-lg font-semibold">Schedule and related coverage</h2><p className="text-sm text-muted-foreground">Enter schedule dates and times in UTC.</p></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2"><span className="text-sm font-medium">Schedule start (UTC)</span><input className={control} defaultValue={utcDateTime(stream?.startsAt ?? null)} name="scheduleStart" type="datetime-local" />{fieldError("scheduleStart") ? <span className="text-sm text-destructive">{fieldError("scheduleStart")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Schedule end (UTC)</span><input className={control} defaultValue={utcDateTime(stream?.endsAt ?? null)} name="scheduleEnd" type="datetime-local" />{fieldError("scheduleEnd") ? <span className="text-sm text-destructive">{fieldError("scheduleEnd")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Related story</span><select className={control} defaultValue={stream?.relatedStoryId ?? ""} name="relatedStoryId"><option value="">None</option>{stories.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="grid gap-2"><span className="text-sm font-medium">Related category</span><select className={control} defaultValue={stream?.relatedCategoryId ?? ""} name="relatedCategoryId"><option value="">None</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </CardContent>
        </Card>

        <Card padding="none">
          <CardHeader><h2 className="text-lg font-semibold">Search and social</h2><p className="text-sm text-muted-foreground">Optional overrides for the localized public page.</p></CardHeader>
          <CardContent className="grid gap-5">
            <label className="grid gap-2"><span className="text-sm font-medium">SEO title</span><input className={control} defaultValue={stream?.seoTitle ?? ""} name="seoTitle" />{fieldError("seoTitle") ? <span className="text-sm text-destructive">{fieldError("seoTitle")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">SEO description</span><textarea className={`${control} min-h-24 py-3`} defaultValue={stream?.seoDescription ?? ""} name="seoDescription" />{fieldError("seoDescription") ? <span className="text-sm text-destructive">{fieldError("seoDescription")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">OpenGraph image URL</span><input className={control} defaultValue={stream?.socialImageUrl ?? ""} inputMode="url" name="openGraphImageUrl" type="url" />{fieldError("openGraphImageUrl") ? <span className="text-sm text-destructive">{fieldError("openGraphImageUrl")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Canonical URL</span><input className={control} name="canonicalUrl" placeholder={`/${locale}/live-tv (automatic)`} readOnly value="" /><span className="text-xs text-muted-foreground">The canonical route is derived from the selected language and cannot be overridden in this schema.</span></label>
          </CardContent>
        </Card>

        {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Saving revalidates only /{locale}/live-tv.</p>
          <Button disabled={pending} type="submit">{pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}{stream ? "Save changes" : "Create channel"}</Button>
        </div>
      </form>

      {stream && view.canDelete ? (
        <form action={deleteLiveTvAction} className="flex justify-end" onSubmit={(event) => { if (!window.confirm("Delete this Live TV configuration? This cannot be undone.")) event.preventDefault(); }}>
          <input name="id" type="hidden" value={stream.id} />
          <Button type="submit" variant="destructive"><Trash2 aria-hidden="true" />Delete configuration</Button>
        </form>
      ) : null}
    </div>
  );
}
