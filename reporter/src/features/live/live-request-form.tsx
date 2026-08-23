"use client";

import { useActionState } from "react";

import { createLiveRequestAction, type LiveRequestActionState } from "./live-request.actions";

const initialState: LiveRequestActionState = { status: "idle" };
const inputClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2";

export function LiveRequestForm({ eligible }: Readonly<{ eligible: boolean }>) {
  const [state, action, pending] = useActionState(createLiveRequestAction, initialState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5 rounded-lg border border-border bg-background p-5 shadow-sm">
      <label className="block">
        <span className="text-sm font-medium">Broadcast title</span>
        <input aria-describedby={errors.title ? "live-title-error" : undefined} className={inputClass} maxLength={240} name="title" required />
        {errors.title ? <span className="mt-1 block text-sm text-destructive" id="live-title-error">{errors.title[0]}</span> : null}
      </label>
      <label className="block">
        <span className="text-sm font-medium">Purpose</span>
        <textarea aria-describedby={errors.purpose ? "live-purpose-error" : undefined} className={inputClass} maxLength={2000} name="purpose" required rows={4} />
        {errors.purpose ? <span className="mt-1 block text-sm text-destructive" id="live-purpose-error">{errors.purpose[0]}</span> : null}
      </label>
      <label className="block">
        <span className="text-sm font-medium">Intended locality</span>
        <input aria-describedby={errors.intendedLocality ? "live-locality-error" : undefined} className={inputClass} maxLength={200} name="intendedLocality" required />
        {errors.intendedLocality ? <span className="mt-1 block text-sm text-destructive" id="live-locality-error">{errors.intendedLocality[0]}</span> : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Expected start</span>
          <input aria-describedby={errors.expectedStartsAt ? "live-start-error" : undefined} className={inputClass} name="expectedStartsAt" required type="datetime-local" />
          <span className="mt-1 block text-xs text-muted-foreground">Times are interpreted as IST and saved once in UTC.</span>
          {errors.expectedStartsAt ? <span className="mt-1 block text-sm text-destructive" id="live-start-error">{errors.expectedStartsAt[0]}</span> : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Expected duration (minutes)</span>
          <input aria-describedby={errors.expectedDurationMinutes ? "live-duration-error" : undefined} className={inputClass} max={480} min={1} name="expectedDurationMinutes" required step={1} type="number" />
          {errors.expectedDurationMinutes ? <span className="mt-1 block text-sm text-destructive" id="live-duration-error">{errors.expectedDurationMinutes[0]}</span> : null}
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Supporting notes <span className="font-normal text-muted-foreground">(private, optional)</span></span>
        <textarea className={inputClass} maxLength={2000} name="supportingNotes" rows={3} />
      </label>
      {state.message ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-verified"} role="status">{state.message}</p> : null}
      <button className="w-full rounded-md bg-foreground px-4 py-3 font-medium text-background disabled:opacity-60" disabled={!eligible || pending} type="submit">
        {pending ? "Submitting…" : "Request live broadcast"}
      </button>
    </form>
  );
}
