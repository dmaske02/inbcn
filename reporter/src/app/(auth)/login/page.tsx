import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { OtpForm } from "@/features/auth/otp-form";
import { authorizeCurrentReporter } from "@/features/auth/server";

export default async function LoginPage() {
  const authorization = await authorizeCurrentReporter();
  if (authorization.ok) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">INBCN Reporter</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with your Indian mobile number.</p>
        <div className="mt-6"><OtpForm temporary={env.server.temporaryOnboarding} /></div>
      </section>
    </main>
  );
}
