"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AdminRole } from "@/features/admin/auth/authorization.model";
import { createStoryAction, saveStoryAction, storyCommandAction, type StoryActionState } from "./story.actions";
import { calculateReadTime } from "@/features/news/server/services/story-reader.model";
import { generateStorySlug, type StoryCommand } from "./story.model";
import type { getStoryEditorView } from "./story.service";

type StoryEditorView = Awaited<ReturnType<typeof getStoryEditorView>>;
const initialState: StoryActionState = { status: "idle" };
const control = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
const commandLabels: Record<StoryCommand, string> = { save: "Save", submit: "Submit for review", approve: "Approve", publish: "Publish", schedule: "Schedule", archive: "Archive", delete: "Delete" };

export function StoryForm({ adminRole, view }: { adminRole: AdminRole; view: StoryEditorView }) {
  const story = view.story;
  const action = story ? saveStoryAction.bind(null, story.id) : createStoryAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [title, setTitle] = useState(story?.title ?? "");
  const [slug, setSlug] = useState(story?.slug ?? "");
  const [manualSlug, setManualSlug] = useState(Boolean(story));
  const [content, setContent] = useState(story?.content ?? "");
  const [languageId, setLanguageId] = useState(story?.languageId ?? view.references.languages[0]?.id ?? "");
  const categories = useMemo(() => view.references.categories.filter((item) => item.languageId === languageId), [languageId, view.references.categories]);
  const canUseEditorialFlags = adminRole !== "writer";

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5">
        <Card padding="none">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold">Editorial content</h2><p className="text-sm text-muted-foreground">All required fields are marked.</p></div>
            <div className="text-right">{story ? <Badge variant="outline" className="capitalize">{story.status.replace("_", " ")}</Badge> : <Badge variant="secondary">New draft</Badge>}<p className="mt-2 text-xs text-muted-foreground">{calculateReadTime(content)} min read</p></div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <label className="grid gap-2"><span className="text-sm font-medium">Headline *</span><input className={control} name="title" value={title} onChange={(event)=>{const next=event.target.value;setTitle(next);if(!manualSlug)setSlug(generateStorySlug(next));}} required />{fieldError("title") ? <span className="text-sm text-destructive">{fieldError("title")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Slug *</span><input className={control} name="slug" value={slug} onChange={(event)=>{setManualSlug(true);setSlug(generateStorySlug(event.target.value));}} required /><span className="text-xs text-muted-foreground">Generated from the headline until you edit it manually.</span>{fieldError("slug") ? <span className="text-sm text-destructive">{fieldError("slug")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Summary *</span><textarea className={`${control} min-h-28 py-3`} defaultValue={story?.summary ?? ""} name="summary" required />{fieldError("summary") ? <span className="text-sm text-destructive">{fieldError("summary")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Body *</span><textarea className={`${control} min-h-80 py-3 font-mono leading-6`} name="content" value={content} onChange={(event)=>setContent(event.target.value)} required />{fieldError("content") ? <span className="text-sm text-destructive">{fieldError("content")}</span> : null}</label>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">Classification</h2></CardHeader><CardContent className="grid gap-5">
            <label className="grid gap-2"><span className="text-sm font-medium">Language *</span><select className={control} name="languageId" value={languageId} onChange={(event)=>setLanguageId(event.target.value)} required>{view.references.languages.map((item)=><option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>
            <label className="grid gap-2"><span className="text-sm font-medium">Category *</span><select className={control} defaultValue={story?.categoryId ?? categories[0]?.id} key={languageId} name="categoryId" required>{categories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{fieldError("categoryId") ? <span className="text-sm text-destructive">{fieldError("categoryId")}</span> : null}</label>
            <label className="grid gap-2"><span className="text-sm font-medium">Source</span><select className={control} defaultValue={story?.sourceId ?? ""} disabled={adminRole === "writer"} name="sourceId"><option value="">No external source</option>{view.references.sources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="grid gap-2"><span className="text-sm font-medium">Tags</span><input className={control} defaultValue={story?.seoKeywords.join(", ") ?? ""} name="tags" placeholder="india, politics, elections" /><span className="text-xs text-muted-foreground">Comma-separated; stored as SEO keywords.</span></label>
          </CardContent></Card>

          <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">Presentation</h2></CardHeader><CardContent className="grid gap-5">
            <label className="grid gap-2"><span className="text-sm font-medium">Featured media</span><select className={control} disabled><option>Media Library coming later</option></select></label>
            <label className="grid gap-2"><span className="text-sm font-medium">Featured media alt</span><input className={control} disabled placeholder="Managed with media metadata" /></label>
            <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-medium"><input defaultChecked={story?.isFeatured} disabled={!canUseEditorialFlags} name="isFeatured" type="checkbox" className="size-4" />Featured</label><label className="flex items-center gap-2 text-sm font-medium"><input defaultChecked={story?.isBreaking} disabled={!canUseEditorialFlags} name="isBreaking" type="checkbox" className="size-4" />Breaking</label></div>
          </CardContent></Card>
        </div>

        <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">SEO</h2></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2">
          <label className="grid gap-2"><span className="text-sm font-medium">SEO title</span><input className={control} defaultValue={story?.seoTitle ?? ""} name="seoTitle" /></label>
          <label className="grid gap-2"><span className="text-sm font-medium">Canonical URL</span><input className={control} defaultValue={story?.canonicalUrl ?? ""} name="canonicalUrl" type="url" />{fieldError("canonicalUrl") ? <span className="text-sm text-destructive">{fieldError("canonicalUrl")}</span> : null}</label>
          <label className="grid gap-2 lg:col-span-2"><span className="text-sm font-medium">SEO description</span><textarea className={`${control} min-h-24 py-3`} defaultValue={story?.seoDescription ?? ""} name="seoDescription" /></label>
          <input name="scheduledAt" type="hidden" value="" />
        </CardContent></Card>

        {state.status === "error" ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{state.message}</p> : null}
        {(!story || view.commands.includes("save")) ? <Button disabled={pending} size="lg" type="submit">{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}{pending ? "Saving…" : story ? "Save changes" : "Save draft"}</Button> : null}
      </form>

      {story ? <Card padding="none"><CardHeader><h2 className="text-lg font-semibold">Workflow actions</h2><p className="text-sm text-muted-foreground">Save content changes before applying a workflow transition.</p></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
        {view.commands.filter((command)=>command!=="save" && command!=="schedule").map((command)=><form action={storyCommandAction} key={command}><input name="id" type="hidden" value={story.id} /><input name="command" type="hidden" value={command} /><Button variant={command === "delete" ? "destructive" : command === "publish" ? "default" : "outline"} type="submit">{commandLabels[command]}</Button></form>)}
        {view.commands.includes("schedule") ? <form action={storyCommandAction} className="flex flex-wrap items-end gap-2"><input name="id" type="hidden" value={story.id} /><input name="command" type="hidden" value="schedule" /><label className="grid gap-1"><span className="text-xs font-medium">Publish date</span><input className={control} defaultValue={story.scheduledAt?.slice(0,16)} name="scheduledAt" required type="datetime-local" /></label><Button variant="outline" type="submit">Schedule</Button></form> : null}
      </CardContent></Card> : null}
    </div>
  );
}
