"use client";

import { useActionState, useRef, useState, type ComponentType, type Ref } from "react";

import {
  completeTemporarySignupAction,
  requestOtpAction,
  temporarySignInAction,
  verifyOtpAction,
  type OtpState,
} from "./actions";
import type { AuthMode } from "./signup-intent.model";
import type { SignupLanguage } from "./signup-languages.server";

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

function SignInPhoneInput({ disabled, inputRef, invalid, readOnly = false }: Readonly<{
  disabled: boolean;
  inputRef?: Ref<HTMLInputElement>;
  invalid: boolean;
  readOnly?: boolean;
}>) {
  return (
    <div className="flex min-h-11 overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
      <span className="flex items-center border-r border-input bg-muted/50 px-3 text-base text-foreground" aria-hidden="true">+91</span>
      <input
        autoComplete="tel"
        className={`${inputClassName} rounded-none border-0 focus-visible:ring-0`}
        disabled={disabled}
        id="phone"
        inputMode="numeric"
        maxLength={10}
        name="phone"
        pattern="[6-9][0-9]{9}"
        placeholder="9876543210"
        readOnly={readOnly}
        ref={inputRef}
        required
        type="tel"
        aria-describedby={invalid ? "phone-error" : undefined}
        aria-invalid={invalid}
      />
    </div>
  );
}

function RequestOtpForm({ Captcha = UnavailableCaptcha, mode }: Readonly<{ Captcha?: ComponentType<CaptchaSlotProps>; mode: AuthMode }>) {
  const [state, formAction, pending] = useActionState(requestOtpAction, initialState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const ready = Boolean(captchaToken);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input name="mode" type="hidden" value={mode} />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="phone">Mobile number</label>
        {mode === "signin" ? <SignInPhoneInput disabled={pending} invalid={Boolean(state.fieldErrors?.phone)} /> : <input
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
        />}
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

function VerifyOtpForm({ phone, mode }: Readonly<{ phone: string; mode: AuthMode }>) {
  const [state, formAction, pending] = useActionState(verifyOtpAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input name="phone" type="hidden" value={phone} />
      <input name="mode" type="hidden" value={mode} />
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

function SignupProgress({ details }: Readonly<{ details: boolean }>) {
  return (
    <div className="grid grid-cols-2 gap-2" aria-label="Account creation progress">
      <div className={`rounded-md border p-3 ${details ? "border-border text-muted-foreground" : "border-foreground bg-muted/40"}`}>
        <p className="text-xs font-medium uppercase tracking-wide">Step 1 of 2</p>
        <p className="mt-1 text-sm font-semibold">Verify mobile</p>
      </div>
      <div className={`rounded-md border p-3 ${details ? "border-foreground bg-muted/40" : "border-border text-muted-foreground"}`}>
        <p className="text-xs font-medium uppercase tracking-wide">Step 2 of 2</p>
        <p className="mt-1 text-sm font-semibold">Your details</p>
      </div>
    </div>
  );
}

function TemporarySignupDetails({
  languages,
  phone,
  token,
}: Readonly<{ languages: readonly SignupLanguage[]; phone: string; token: string }>) {
  const [state, formAction, pending] = useActionState(completeTemporarySignupAction, initialState);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input name="phone" type="hidden" value={phone} />
      <input name="token" type="hidden" value={token} />
      <SignupProgress details />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Create your Reporter profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tell us about yourself.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="fullName">Full name <span aria-hidden="true">*</span></label>
        <input autoComplete="name" className={inputClassName} disabled={pending} id="fullName" name="fullName" required
          aria-describedby={state.fieldErrors?.fullName ? "full-name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.fullName)} />
        {state.fieldErrors?.fullName ? <p className="text-sm text-destructive" id="full-name-error">{state.fieldErrors.fullName[0]}</p> : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="email">Email address <span aria-hidden="true">*</span></label>
        <input autoComplete="email" className={inputClassName} disabled={pending} id="email" name="email" required type="email"
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.email)} />
        {state.fieldErrors?.email ? <p className="text-sm text-destructive" id="email-error">{state.fieldErrors.email[0]}</p> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="cityLocality">City / locality <span aria-hidden="true">*</span></label>
          <input autoComplete="address-level2" className={inputClassName} disabled={pending} id="cityLocality" name="cityLocality" required
            aria-describedby={state.fieldErrors?.cityLocality ? "city-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.cityLocality)} />
          {state.fieldErrors?.cityLocality ? <p className="text-sm text-destructive" id="city-error">{state.fieldErrors.cityLocality[0]}</p> : null}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="state">State <span aria-hidden="true">*</span></label>
          <input autoComplete="address-level1" className={inputClassName} disabled={pending} id="state" name="state" required
            aria-describedby={state.fieldErrors?.state ? "state-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.state)} />
          {state.fieldErrors?.state ? <p className="text-sm text-destructive" id="state-error">{state.fieldErrors.state[0]}</p> : null}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="preferredLanguageId">Preferred language <span aria-hidden="true">*</span></label>
        <select className={inputClassName} disabled={pending} id="preferredLanguageId" name="preferredLanguageId" required
          aria-describedby={state.fieldErrors?.preferredLanguageId ? "language-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.preferredLanguageId)} defaultValue="">
          <option disabled value="">Choose a language</option>
          {languages.map((language) => <option key={language.id} value={language.id}>{language.name} ({language.nativeName})</option>)}
        </select>
        {state.fieldErrors?.preferredLanguageId ? <p className="text-sm text-destructive" id="language-error">{state.fieldErrors.preferredLanguageId[0]}</p> : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="experience">Reporter experience / background</label>
        <textarea className={`${inputClassName} min-h-24 py-3`} disabled={pending} id="experience" maxLength={500} name="experience" rows={3}
          aria-describedby={state.fieldErrors?.experience ? "experience-error" : "experience-help"} aria-invalid={Boolean(state.fieldErrors?.experience)} />
        <p className="text-xs text-muted-foreground" id="experience-help">Optional. Include newsroom, community, student, or independent reporting experience.</p>
        {state.fieldErrors?.experience ? <p className="text-sm text-destructive" id="experience-error">{state.fieldErrors.experience[0]}</p> : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="introduction">Short introduction / reason for joining <span aria-hidden="true">*</span></label>
        <textarea className={`${inputClassName} min-h-28 py-3`} disabled={pending} id="introduction" maxLength={500} name="introduction" required rows={4}
          aria-describedby={state.fieldErrors?.introduction ? "introduction-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.introduction)} />
        {state.fieldErrors?.introduction ? <p className="text-sm text-destructive" id="introduction-error">{state.fieldErrors.introduction[0]}</p> : null}
      </div>
      {languages.length === 0 ? <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground" role="status">Languages are temporarily unavailable.</p> : null}
      {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}
      <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending || languages.length === 0} type="submit">
        {pending ? "Creating account…" : "Create reporter account"}
      </button>
    </form>
  );
}

function TemporaryOtpForm({ languages, mode }: Readonly<{ languages: readonly SignupLanguage[]; mode: AuthMode }>) {
  const [state, formAction, pending] = useActionState(temporarySignInAction, initialState);
  const [codeRequested, setCodeRequested] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  function requestCode() {
    if (phoneRef.current?.reportValidity()) setCodeRequested(true);
  }

  if (mode === "create" && state.status === "verified") {
    return <TemporarySignupDetails languages={languages} phone={state.verifiedPhone ?? ""} token={state.verifiedToken ?? ""} />;
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input name="mode" type="hidden" value={mode} />
      {mode === "create" ? <>
        <SignupProgress details={false} />
        <p className="text-sm text-muted-foreground">Verify your mobile number to get started.</p>
      </> : null}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="phone">Mobile number</label>
        {mode === "signin" ? <SignInPhoneInput disabled={pending} inputRef={phoneRef} invalid={Boolean(state.fieldErrors?.phone)} readOnly={codeRequested} /> : <input
          autoComplete="tel"
          className={inputClassName}
          disabled={pending}
          id="phone"
          name="phone"
          placeholder="+919876543210"
          readOnly={codeRequested}
          ref={phoneRef}
          required
          type="tel"
          aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.phone)}
        />}
        {state.fieldErrors?.phone ? <p className="text-sm text-destructive" id="phone-error">{state.fieldErrors.phone[0]}</p> : null}
      </div>

      {!codeRequested ? (
        <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground" onClick={requestCode} type="button">
          Send code
        </button>
      ) : <div className="space-y-2">
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
      </div>}

      {state.status === "error" ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{state.message}</p> : null}

      {codeRequested ? (
        <button className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Verifying…" : mode === "create" ? "Verify & Continue" : "Continue"}
        </button>
      ) : null}
    </form>
  );
}

export function OtpForm({
  phone,
  captchaSlot,
  languages = [],
  mode = "signin",
  temporary = false,
}: Readonly<{ phone?: string; captchaSlot?: ComponentType<CaptchaSlotProps>; languages?: readonly SignupLanguage[]; mode?: AuthMode; temporary?: boolean }>) {
  if (temporary) return <TemporaryOtpForm languages={languages} mode={mode} />;
  return phone ? <VerifyOtpForm mode={mode} phone={phone} /> : <RequestOtpForm Captcha={captchaSlot} mode={mode} />;
}
