"use client";

import { useActionState, useState } from "react";

import { completeConsentReceiptsAction, type ApplicationActionState } from "./application.actions";
import { ConsentForm } from "./consent-form";
import type { ConsentLocale } from "./consent.model";
import type { ReporterApplicationView } from "./application.repository";
import { ReporterCheckout } from "../payments/reporter-checkout";

const labels = {
  draft: "Application saved",
  payment_pending: "Payment pending",
  kyc_pending: "Identity verification pending",
  under_review: "Application under review",
  approved: "Application approved",
  rejected: "Application rejected",
  cancelled: "Application cancelled",
} as const;

export function ApplicationStatus({
  application,
  razorpayKeyId,
}: Readonly<{ application: ReporterApplicationView; razorpayKeyId?: string }>) {
  const [message, setMessage] = useState("");
  const [locale, setLocale] = useState<ConsentLocale>("en");
  const saveConsents = completeConsentReceiptsAction.bind(null, application.id);
  const [consentState, consentAction, consentPending] = useActionState<ApplicationActionState, FormData>(
    saveConsents,
    { status: "idle" },
  );

  async function startKyc() {
    setMessage("Starting identity verification…");
    const response = await fetch("/api/kyc/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: application.id }),
    });
    const result = await response.json() as { code?: string; url?: string };
    if (response.ok && result.url) {
      window.location.assign(result.url);
      return;
    }
    setMessage(result.code === "kyc-not-configured"
      ? "Hosted identity verification is not configured yet. Your application remains eligible to retry."
      : "Identity verification could not be started. Please try again.");
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-background p-6 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{labels[application.status]}</h1>
      <p className="text-sm text-muted-foreground">
        Your public portrait is uploaded separately and remains pending identity-match and admin approval.
      </p>
      {application.completionDeadline ? (
        <p className="text-sm">Complete identity verification by <time dateTime={application.completionDeadline}>{new Date(application.completionDeadline).toLocaleDateString("en-IN")}</time>.</p>
      ) : null}
      {application.status === "draft" && application.consentsComplete ? (
        <div className="space-y-3">
          <p className="text-sm">All current consent receipts are stored. Pay the application fee to continue.</p>
          <ReporterCheckout
            applicationId={application.id}
            keyId={razorpayKeyId}
            purpose="application"
          />
        </div>
      ) : null}
      {application.status === "payment_pending" ? (
        <div className="space-y-3">
          <p className="text-sm">Resume the existing secure payment order. A retry will not create a second application charge.</p>
          <ReporterCheckout
            applicationId={application.id}
            keyId={razorpayKeyId}
            purpose="application"
          />
        </div>
      ) : null}
      {application.status === "draft" && !application.consentsComplete ? (
        <form action={consentAction} className="space-y-4">
          <p className="text-sm text-red-700">Consent receipts are incomplete. Payment remains blocked.</p>
          <ConsentForm locale={locale} onLocaleChange={setLocale} />
          {consentState.message ? <p aria-live="polite" className="text-sm">{consentState.message}</p> : null}
          <button className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60" disabled={consentPending} type="submit">
            {consentPending ? "Saving…" : "Save consent receipts"}
          </button>
        </form>
      ) : null}
      {application.status === "kyc_pending" ? (
        <button className="rounded-md bg-foreground px-4 py-2 text-background" onClick={startKyc} type="button">
          Start or retry identity verification
        </button>
      ) : null}
      {message ? <p aria-live="polite" className="text-sm">{message}</p> : null}
    </section>
  );
}
