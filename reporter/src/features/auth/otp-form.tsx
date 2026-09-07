"use client";

import { useActionState, useRef, useState, type ComponentType, type Ref } from "react";

import { requestOtpAction, temporarySignInAction, verifyOtpAction, type OtpState } from "./actions";
import type { AuthMode } from "./signup-intent.model";

const initialState: OtpState = { status: "idle" };
const inputClassName = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60";

export type CaptchaSlotProps = Readonly<{ disabled: boolean; onTokenChange: (token: string | null) => void }>;

function UnavailableCaptcha() {
  return <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">Sign-in is temporarily unavailable while CAPTCHA verification is being configured.</p>;
}

function SignInPhoneInput({ disabled, inputRef, invalid, readOnly = false }: Readonly<{
  disabled: boolean;
  inputRef?: Ref<HTMLInputElement>;
  invalid: boolean;
  readOnly?: boolean;
}>) {
  return <div className="flex min-h-11 overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
    <span className="flex items-center border-r border-input bg-muted/50 px-3 text-base text-foreground" aria-hidden="true">+91</span>
    <input autoComplete="tel" className={`${inputClassName} rounded-none border-0 focus-visible:ring-0`} disabled={disabled} id="phone" inputMode="numeric" maxLength={10} name="phone" pattern="[6-9][0-9]{9}" placeholder="9876543210" readOnly={readOnly} ref={inputRef} required type="tel" aria-describedby={invalid ? "phone-error" : undefined} aria-invalid={invalid} />
  </div>;
}

function PhoneError({ state }: Readonly<{ state: OtpState }>) {
  return state.fieldErrors?.phone ? <p className="text-sm text-destructive" id="phone-error">{state.fieldErrors.phone[0]}</p> : null;
}

function RequestOtpForm({ Captcha = UnavailableCaptcha, mode }: Readonly<{ Captcha?: ComponentType<CaptchaSlotProps>; mode: AuthMode }>) {
  const [state, formAction, pending] = useActionState(requestOtpAction, initialState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  return <form action={formAction} className="space-y-5" noValidate>
    <input name="mode" type="hidden" value={mode} />
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="phone">Mobile number</label>
      <SignInPhoneInput disabled={pending} invalid={Boolean(state.fieldErrors?.phone)} />
      <PhoneError state={state} />
    </div>
    <input name="captchaToken" type="hidden" value={captchaToken ?? ""} />
    <Captcha disabled={pending} onTokenChange={setCaptchaToken} />
    {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}
    <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending || !captchaToken} type="submit">{pending ? "Sending code…" : "Send code"}</button>
  </form>;
}

function VerifyOtpForm({ phone, mode }: Readonly<{ phone: string; mode: AuthMode }>) {
  const [state, formAction, pending] = useActionState(verifyOtpAction, initialState);
  return <form action={formAction} className="space-y-5" noValidate>
    <input name="phone" type="hidden" value={phone} />
    <input name="mode" type="hidden" value={mode} />
    <p className="text-sm text-muted-foreground">We sent a code to {phone}.</p>
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="token">Verification code</label>
      <input autoComplete="one-time-code" className={inputClassName} disabled={pending} id="token" inputMode="numeric" name="token" required type="text" aria-describedby={state.fieldErrors?.token ? "token-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.token)} />
      {state.fieldErrors?.token ? <p className="text-sm text-destructive" id="token-error">{state.fieldErrors.token[0]}</p> : null}
    </div>
    {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}
    <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">{pending ? "Verifying…" : "Verify code"}</button>
  </form>;
}

function TemporaryOtpForm({ mode }: Readonly<{ mode: AuthMode }>) {
  const [state, formAction, pending] = useActionState(temporarySignInAction, initialState);
  const [codeRequested, setCodeRequested] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const creating = mode === "create";

  function requestCode() {
    if (phoneRef.current?.reportValidity()) setCodeRequested(true);
  }

  return <form action={formAction} className="space-y-5" noValidate>
    <input name="mode" type="hidden" value={mode} />
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="phone">Mobile number</label>
      <SignInPhoneInput disabled={pending} inputRef={phoneRef} invalid={Boolean(state.fieldErrors?.phone)} readOnly={codeRequested} />
      <PhoneError state={state} />
    </div>
    {!codeRequested ? <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground" onClick={requestCode} type="button">Send code</button> : <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="token">Verification code</label>
      <input autoComplete="one-time-code" className={inputClassName} disabled={pending} id="token" inputMode="numeric" name="token" required type="text" aria-describedby={state.fieldErrors?.token ? "token-error" : "preview-code"} aria-invalid={Boolean(state.fieldErrors?.token)} />
      <p className="text-sm text-muted-foreground" id="preview-code">Client preview code: <strong>1234</strong></p>
      {state.fieldErrors?.token ? <p className="text-sm text-destructive" id="token-error">{state.fieldErrors.token[0]}</p> : null}
    </div>}
    {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}
    {codeRequested ? <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">{pending ? "Verifying…" : creating ? "Verify & Continue" : "Continue"}</button> : null}
  </form>;
}

export function OtpForm({ phone, captchaSlot, mode = "signin", temporary = false }: Readonly<{ phone?: string; captchaSlot?: ComponentType<CaptchaSlotProps>; mode?: AuthMode; temporary?: boolean }>) {
  if (temporary) return <TemporaryOtpForm mode={mode} />;
  return phone ? <VerifyOtpForm mode={mode} phone={phone} /> : <RequestOtpForm Captcha={captchaSlot} mode={mode} />;
}
