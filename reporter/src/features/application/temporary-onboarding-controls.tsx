"use client";

import { useActionState } from "react";

import type { ReporterApplicationStatus } from "@inbcn/domain";
import {
  completeTemporaryKycAction,
  completeTemporaryPaymentAction,
  type TemporaryOnboardingActionState,
} from "./temporary-onboarding.actions";

const initialState: TemporaryOnboardingActionState = { status: "idle" };

function PaymentControl({ applicationId }: Readonly<{ applicationId: string }>) {
  const action = completeTemporaryPaymentAction.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<TemporaryOnboardingActionState, FormData>(
    action,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">Client preview only. No real payment will be collected.</p>
      <button className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Completing…" : "Complete dummy ₹100 payment"}
      </button>
      {state.message ? <p aria-live="polite" className="text-sm">{state.message}</p> : null}
    </form>
  );
}

function KycControl({ applicationId }: Readonly<{ applicationId: string }>) {
  const action = completeTemporaryKycAction.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<TemporaryOnboardingActionState, FormData>(
    action,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">Client preview only. This simulates KYC and application approval.</p>
      <button className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Completing…" : "Complete dummy KYC"}
      </button>
      {state.message ? <p aria-live="polite" className="text-sm">{state.message}</p> : null}
    </form>
  );
}

export function TemporaryOnboardingControls({
  applicationId,
  status,
}: Readonly<{ applicationId: string; status: ReporterApplicationStatus }>) {
  if (status === "draft" || status === "payment_pending") {
    return <PaymentControl applicationId={applicationId} />;
  }
  if (status === "kyc_pending") return <KycControl applicationId={applicationId} />;
  return null;
}
