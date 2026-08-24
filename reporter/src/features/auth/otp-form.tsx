"use client";

import { useActionState, useState, type ComponentType } from "react";

import {
  requestOtpAction,
  temporarySignInAction,
  verifyOtpAction,
  type OtpState,
} from "./actions";

const initialState: OtpState = { status: "idle" };
const inputClassName =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60";

export type CaptchaSlotProps = Readonly<{
  disabled: boolean;
  onTokenChange: (token: string | null) => void;
}>;

function UnavailableCaptcha() {
  return (
    <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
      Sign-in is temporarily unavailable while CAPTCHA verification is being configured.
    </p>
  );
}

function RequestOtpForm({ Captcha = UnavailableCaptcha }: Readonly<{ Captcha?: ComponentType<CaptchaSlotProps> }>) {
  const [state, formAction, pending] = useActionState(requestOtpAction, initialState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const ready = Boolean(captchaToken);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="phone">Mobile number</label>
        <input
          autoComplete="tel"
          className={inputClassName}
          disabled={pending}
          id="phone"
          name="phone"
          placeholder="+919876543210"
          required
          type="tel"
          aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.phone)}
        />
        {state.fieldErrors?.phone ? <p className="text-sm text-destructive" id="phone-error">{state.fieldErrors.phone[0]}</p> : null}
      </div>

      <input name="captchaToken" type="hidden" value={captchaToken ?? ""} />
      <Captcha disabled={pending} onTokenChange={setCaptchaToken} />

      {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}

      <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending || !ready} type="submit">
        {pending ? "Sending code…" : "Send code"}
      </button>
    </form>
  );
}

function VerifyOtpForm({ phone }: Readonly<{ phone: string }>) {
  const [state, formAction, pending] = useActionState(verifyOtpAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input name="phone" type="hidden" value={phone} />
      <p className="text-sm text-muted-foreground">We sent a code to {phone}.</p>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="token">Verification code</label>
        <input
          autoComplete="one-time-code"
          className={inputClassName}
          disabled={pending}
          id="token"
          inputMode="numeric"
          name="token"
          required
          type="text"
          aria-describedby={state.fieldErrors?.token ? "token-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.token)}
        />
        {state.fieldErrors?.token ? <p className="text-sm text-destructive" id="token-error">{state.fieldErrors.token[0]}</p> : null}
      </div>

      {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}

      <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Verifying…" : "Verify code"}
      </button>
    </form>
  );
}

function TemporaryOtpForm() {
  const [state, formAction, pending] = useActionState(temporarySignInAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="phone">Mobile number</label>
        <input
          autoComplete="tel"
          className={inputClassName}
          disabled={pending}
          id="phone"
          name="phone"
          placeholder="+919876543210"
          required
          type="tel"
          aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.phone)}
        />
        {state.fieldErrors?.phone ? <p className="text-sm text-destructive" id="phone-error">{state.fieldErrors.phone[0]}</p> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="token">Verification code</label>
        <input
          autoComplete="one-time-code"
          className={inputClassName}
          disabled={pending}
          id="token"
          inputMode="numeric"
          name="token"
          required
          type="text"
          aria-describedby={state.fieldErrors?.token ? "token-error" : "preview-code"}
          aria-invalid={Boolean(state.fieldErrors?.token)}
        />
        <p className="text-sm text-muted-foreground" id="preview-code">Client preview code: <strong>1234</strong></p>
        {state.fieldErrors?.token ? <p className="text-sm text-destructive" id="token-error">{state.fieldErrors.token[0]}</p> : null}
      </div>

      {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}

      <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}

export function OtpForm({
  phone,
  captchaSlot,
  temporary = false,
}: Readonly<{ phone?: string; captchaSlot?: ComponentType<CaptchaSlotProps>; temporary?: boolean }>) {
  if (temporary) return <TemporaryOtpForm />;
  return phone ? <VerifyOtpForm phone={phone} /> : <RequestOtpForm Captcha={captchaSlot} />;
}
