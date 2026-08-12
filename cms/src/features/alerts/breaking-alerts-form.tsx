"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createAlertAction, saveAlertAction, type AlertActionState } from "./breaking-alerts.actions";
import type { AwaitedReturn } from "./breaking-alerts.types";

const initial: AlertActionState = { status: "idle" };
function localDate(value: string | null | undefined) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16); }

export function BreakingAlertForm({ view }: { view: AwaitedReturn }) {
  const alert = view.alert; const action = alert ? saveAlertAction.bind(null, alert.id) : createAlertAction;
  const [state, formAction, pending] = useActionState(action, initial);
  return <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <Card padding="none"><CardHeader><h2 className="font-semibold">Alert details</h2></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2 text-sm font-medium">Title<input name="title" required maxLength={180} defaultValue={alert?.title ?? ""} className="mt-1 min-h-10 w-full rounded-md border px-3" /></label>
      <label className="sm:col-span-2 text-sm font-medium">Message<textarea name="message" required maxLength={1000} defaultValue={alert?.message ?? ""} className="mt-1 min-h-28 w-full rounded-md border p-3" /></label>
      <label className="text-sm font-medium">Type<select name="type" defaultValue={alert?.type ?? "breaking"} className="mt-1 min-h-10 w-full rounded-md border px-3"><option value="breaking">Breaking</option><option value="alert">Alert</option><option value="emergency">Emergency</option></select></label>
      <label className="text-sm font-medium">Placement<select name="placement" defaultValue={alert?.placement ?? "breaking_ticker"} className="mt-1 min-h-10 w-full rounded-md border px-3"><option value="breaking_ticker">Breaking ticker</option><option value="pinned_banner">Pinned banner</option><option value="emergency_banner">Emergency banner</option></select></label>
      <label className="text-sm font-medium">Language<select name="languageId" required defaultValue={alert?.language_id ?? ""} className="mt-1 min-h-10 w-full rounded-md border px-3"><option value="">Select language</option>{view.references.languages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="text-sm font-medium">Priority<input name="priority" type="number" min="1" max="100" defaultValue={alert?.priority ?? 50} className="mt-1 min-h-10 w-full rounded-md border px-3" /></label>
      <label className="text-sm font-medium">Target<select name="targetScope" defaultValue={alert?.target_scope ?? "global"} className="mt-1 min-h-10 w-full rounded-md border px-3"><option value="global">Entire language site</option><option value="category">Category</option><option value="story">Story</option></select></label>
      <label className="text-sm font-medium">Category<select name="categoryId" defaultValue={alert?.category_id ?? ""} className="mt-1 min-h-10 w-full rounded-md border px-3"><option value="">None</option>{view.references.categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="sm:col-span-2 text-sm font-medium">Story<select name="storyId" defaultValue={alert?.story_id ?? ""} className="mt-1 min-h-10 w-full rounded-md border px-3"><option value="">None</option>{view.references.stories.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
      <label className="text-sm font-medium">Starts<input name="startAt" type="datetime-local" required defaultValue={localDate(alert?.start_at) || localDate(new Date().toISOString())} className="mt-1 min-h-10 w-full rounded-md border px-3" /></label>
      <label className="text-sm font-medium">Expires<input name="endAt" type="datetime-local" defaultValue={localDate(alert?.end_at)} className="mt-1 min-h-10 w-full rounded-md border px-3" /></label>
      <label className="text-sm font-medium">Background<input name="backgroundColor" type="color" defaultValue={alert?.background_color ?? "#B42318"} className="mt-1 h-10 w-full rounded-md border" /></label><label className="text-sm font-medium">Text<input name="textColor" type="color" defaultValue={alert?.text_color ?? "#FFFFFF"} className="mt-1 h-10 w-full rounded-md border" /></label>
      <label className="flex items-center gap-2 text-sm"><input name="dismissible" type="checkbox" defaultChecked={alert?.dismissible ?? true} /> Dismissible</label>
      <input type="hidden" name="status" value={alert?.status ?? "draft"} /><input type="hidden" name="isActive" value={alert?.is_active ? "on" : ""} />
      {state.message ? <p className="sm:col-span-2 text-sm text-destructive">{state.message}</p> : null}<div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save alert"}</Button></div>
    </CardContent></Card>
    <Card padding="none"><CardHeader><h2 className="font-semibold">Preview</h2></CardHeader><CardContent><div style={{backgroundColor: alert?.background_color ?? "#B42318",color: alert?.text_color ?? "#FFFFFF"}} className="rounded-md p-4"><p className="text-xs font-bold uppercase tracking-wider">{alert?.type ?? "Breaking"}</p><p className="mt-1 font-semibold">{alert?.title || "Alert title"}</p><p className="mt-1 text-sm opacity-90">{alert?.message || "Alert message preview"}</p></div></CardContent></Card>
  </form>;
}
