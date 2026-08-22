"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { SubmissionActionState } from "./submission.actions";

const initialState: SubmissionActionState = { status: "idle" };

export function SubmissionForm({
  action,
  children,
  className,
}: Readonly<{
  action(state: SubmissionActionState, formData: FormData): Promise<SubmissionActionState>;
  children: React.ReactNode;
  className?: string;
}>) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className={className}>
      {children}
      {state.message ? (
        <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : undefined}>
          {state.message}
        </p>
      ) : null}
      {state.fieldErrors ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {Object.entries(state.fieldErrors).flatMap(([field, messages]) => messages.map((message) => (
            <li key={`${field}:${message}`}>{message}</li>
          )))}
        </ul>
      ) : null}
    </form>
  );
}

export function SubmissionButton({ children, className }: Readonly<{
  children: React.ReactNode;
  className: string;
}>) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} type="submit">{pending ? "Working…" : children}</button>;
}
