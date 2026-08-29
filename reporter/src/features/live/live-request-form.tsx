"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { createLiveRequestAction, type LiveRequestActionState } from "./live-request.actions";

const initialState: LiveRequestActionState = { status: "idle" };
const inputClass = (invalid = false) =>
  `mt-2 min-h-11 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base transition-colors sm:text-sm ${invalid ? "border-destructive focus-visible:ring-destructive" : "border-input"}`;

export function LiveRequestForm({ eligible }: Readonly<{ eligible: boolean }>) {
  const [state, action, pending] = useActionState(createLiveRequestAction, initialState);
  const [startInvalid, setStartInvalid] = useState(false);
  const errors = state.fieldErrors ?? {};
  const startError = errors.expectedStartsAt?.[0] ?? (startInvalid ? "Please enter a complete date and time." : null);
  return (
    <Card>
      <form action={action}>
        <CardHeader>
          <h2 className="text-lg font-semibold tracking-tight">Broadcast details</h2>
          <p className="text-sm text-muted-foreground">Describe the planned broadcast for editorial review. All required fields must be complete.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Broadcast title</span>
            <input aria-describedby={errors.title ? "live-title-error" : undefined} aria-invalid={Boolean(errors.title)} className={inputClass(Boolean(errors.title))} maxLength={240} name="title" required />
            {errors.title ? <span className="mt-1.5 block text-sm text-destructive" id="live-title-error">{errors.title[0]}</span> : null}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Purpose</span>
            <textarea aria-describedby={errors.purpose ? "live-purpose-error" : undefined} aria-invalid={Boolean(errors.purpose)} className={inputClass(Boolean(errors.purpose))} maxLength={2000} name="purpose" required rows={4} />
            {errors.purpose ? <span className="mt-1.5 block text-sm text-destructive" id="live-purpose-error">{errors.purpose[0]}</span> : null}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Intended locality</span>
            <input aria-describedby={errors.intendedLocality ? "live-locality-error" : undefined} aria-invalid={Boolean(errors.intendedLocality)} className={inputClass(Boolean(errors.intendedLocality))} maxLength={200} name="intendedLocality" required />
            {errors.intendedLocality ? <span className="mt-1.5 block text-sm text-destructive" id="live-locality-error">{errors.intendedLocality[0]}</span> : null}
          </label>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Expected start</span>
              <input aria-describedby={`live-start-help${startError ? " live-start-error" : ""}`} aria-invalid={Boolean(startError)} className={inputClass(Boolean(startError))} name="expectedStartsAt" onInput={(event) => setStartInvalid(!event.currentTarget.validity.valid)} onInvalid={() => setStartInvalid(true)} required type="datetime-local" />
              <span className="mt-1.5 block text-xs text-muted-foreground" id="live-start-help">Times are interpreted as IST and saved once in UTC.</span>
              {startError ? <span aria-live="polite" className="mt-1.5 block text-sm text-destructive" id="live-start-error">{startError}</span> : null}
            </label>
            <label className="block">
              <span className="text-sm font-medium">Expected duration (minutes)</span>
              <input aria-describedby={errors.expectedDurationMinutes ? "live-duration-error" : undefined} aria-invalid={Boolean(errors.expectedDurationMinutes)} className={inputClass(Boolean(errors.expectedDurationMinutes))} max={480} min={1} name="expectedDurationMinutes" required step={1} type="number" />
              {errors.expectedDurationMinutes ? <span className="mt-1.5 block text-sm text-destructive" id="live-duration-error">{errors.expectedDurationMinutes[0]}</span> : null}
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Supporting notes <span className="font-normal text-muted-foreground">(private, optional)</span></span>
            <textarea className={inputClass()} maxLength={2000} name="supportingNotes" rows={3} />
          </label>
          {state.message ? <p aria-live="polite" className={`rounded-md border p-3 text-sm ${state.status === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-verified/30 bg-verified/5 text-verified"}`} role="status">{state.message}</p> : null}
        </CardContent>
        <CardFooter className="justify-end border-t border-border pt-5 sm:pt-6">
          <Button className="w-full sm:w-auto" disabled={!eligible || pending} type="submit">{pending ? "Submitting…" : "Request live broadcast"}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
