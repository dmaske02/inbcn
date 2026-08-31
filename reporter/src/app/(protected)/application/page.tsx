import { ApplicationForm } from "@/features/application/application-form";
import { getCurrentApplication } from "@/features/application/application.repository";
import { ApplicationStatus } from "@/features/application/application-status";
import { requireReporterSession } from "@/features/auth/server";
import { env } from "@/config/env";
import { getCurrentDemoIdentity } from "@/features/application/demo-payment-waiver.identity";

export default async function ApplicationPage() {
  const actor = await requireReporterSession();
  if (actor.state === "reporter") {
    return (
      <section className="rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reporter approved</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your approved reporter account does not need another application.</p>
      </section>
    );
  }
  const application = await getCurrentApplication(actor.userId);
  if (application) {
    const demoIdentity = env.server.demoMode ? await getCurrentDemoIdentity(actor.userId) : null;
    return (
      <ApplicationStatus
        application={application}
        razorpayKeyId={env.public.razorpayKeyId}
        temporaryOnboarding={env.server.temporaryOnboarding}
        demoPaymentWaiver={env.server.demoMode && demoIdentity !== null}
      />
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reporter application</h1>
        <p className="mt-2 text-sm text-muted-foreground">Complete every declaration and consent notice before payment.</p>
      </header>
      <ApplicationForm />
    </section>
  );
}
