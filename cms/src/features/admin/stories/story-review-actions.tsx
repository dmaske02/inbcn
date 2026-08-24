"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { storyCommandAction } from "./story.actions";

const copy = {
  approve: { trigger: "Approve", title: "Approve this Story for publication?", description: "The Story will move to Approved and retain its current content." },
  reject: { trigger: "Send Back", title: "Send this Story back for revision?", description: "Give the writer a clear reason for the requested revision." },
  send_back: { trigger: "Return to Draft", title: "Return this Story to draft?", description: "The rejection reason will be cleared and the Story will become editable again." },
} as const;

export function StoryReviewAction({ command, id, expectedUpdatedAt }: { command: "approve" | "reject" | "send_back"; id: string; expectedUpdatedAt: string }) {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const reasonError = command === "reject" && (reason.trim().length === 0 || reason.length > 1000);
  return <DialogPrimitive.Root><DialogPrimitive.Trigger asChild><Button variant={command === "approve" ? "default" : "outline"} type="button">{copy[command].trigger}</Button></DialogPrimitive.Trigger><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" /><DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-background p-6 shadow-xl focus:outline-none"><div className="flex items-start justify-between gap-4"><div><DialogPrimitive.Title className="text-xl font-semibold">{copy[command].title}</DialogPrimitive.Title><DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">{copy[command].description}</DialogPrimitive.Description></div><DialogPrimitive.Close asChild><Button aria-label="Close dialog" size="icon" variant="ghost"><X aria-hidden="true" /></Button></DialogPrimitive.Close></div><form action={storyCommandAction} className="mt-6 space-y-4"><input name="id" type="hidden" value={id} /><input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} /><input name="command" type="hidden" value={command} />{command === "reject" ? <label className="grid gap-2" htmlFor={reasonId}><span className="text-sm font-medium">Reason for revision</span><textarea aria-describedby={`${reasonId}-help`} aria-invalid={reasonError} className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" id={reasonId} maxLength={1000} name="rejectionReason" onChange={(event) => setReason(event.target.value)} required value={reason} /><span className="text-xs text-muted-foreground" id={`${reasonId}-help`}>Required. Up to 1000 characters.</span><span aria-live="polite" className="text-sm text-destructive">{reason.length > 1000 ? "Reason must be 1000 characters or fewer." : ""}</span></label> : null}<div className="flex justify-end gap-2"><DialogPrimitive.Close asChild><Button type="button" variant="outline">Cancel</Button></DialogPrimitive.Close><Button disabled={reasonError} type="submit" variant={command === "reject" ? "destructive" : "default"}>{copy[command].trigger}</Button></div></form></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
