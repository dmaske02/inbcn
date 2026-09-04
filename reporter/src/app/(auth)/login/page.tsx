import Link from "next/link";
import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { OtpForm } from "@/features/auth/otp-form";
import { authorizeCurrentReporter } from "@/features/auth/server";
import { parseAuthMode } from "@/features/auth/signup-intent.model";

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ mode?: string | string[] }> }>) {
  const authorization = await authorizeCurrentReporter();
  if (authorization.ok) {
    redirect("/dashboard");
  }
  const requestedMode = parseAuthMode((await searchParams).mode);
  const creating = env.server.demoMode && requestedMode === "create";
  const mode = creating ? "create" : "signin";

  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{creating ? "Create your INBCN account" : "INBCN Reporter"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {creating
            ? "Verify your mobile number to get started with your INBCN reporter application."
            : "Sign in to your Reporter account."}
        </p>
        <div className="mt-6"><OtpForm mode={mode} temporary={env.server.demoMode} /></div>
        {env.server.demoMode ? <p className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
          {creating ? "Already have an account? " : "New to INBCN? "}
          <Link
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            href={creating ? "/login" : "/login?mode=create"}
          >
            {creating ? "Sign in" : "Create reporter account"}
          </Link>
        </p> : null}
      </section>
    </main>
  );
}
