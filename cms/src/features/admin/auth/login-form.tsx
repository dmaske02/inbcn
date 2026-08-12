"use client";

import { useActionState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "./actions";

const inputClassName =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60";

const initialLoginState: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialLoginState,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={inputClassName}
          disabled={pending}
          required
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : undefined
          }
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={inputClassName}
          disabled={pending}
          required
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-sm text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      <div className="rounded-md bg-muted/60 p-3">
        <label className="flex items-start gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked
            disabled
            readOnly
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Remember session
            <span className="mt-1 block font-normal text-muted-foreground">
              Session persistence is managed securely by Supabase.
            </span>
          </span>
        </label>
      </div>

      {state.status === "error" ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
        {pending ? "Signing in…" : "Sign in securely"}
      </Button>
    </form>
  );
}
