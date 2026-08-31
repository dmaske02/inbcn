"use client";

import { useActionState } from "react";
import { waiveDemoPaymentAction, type DemoPaymentWaiverActionState } from "./demo-payment-waiver.actions";

export function DemoPaymentWaiverControl({ applicationId }: Readonly<{ applicationId: string }>) {
  const action = waiveDemoPaymentAction.bind(null, applicationId);
  const [state, formAction, pending] = useActionState<DemoPaymentWaiverActionState, FormData>(action, { status: "idle" });
  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h2 className="font-medium">Payment is disabled for this demo</h2>
        <p className="mt-1 text-sm text-muted-foreground">No payment or Razorpay transaction will be created.</p>
      </div>
      <form action={formAction}>
        <button className="min-h-11 rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Continuing…" : "Continue demo without payment"}
        </button>
      </form>
      {state.message ? <p aria-live="polite" className="text-sm">{state.message}</p> : null}
    </div>
  );
}
