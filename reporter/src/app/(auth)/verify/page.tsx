import { redirect } from "next/navigation";

import { validateIndianPhone } from "@/features/auth/authorization.model";
import { OtpForm } from "@/features/auth/otp-form";
import { authorizeCurrentReporter } from "@/features/auth/server";

export default async function VerifyPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ phone?: string }> }>) {
  const { phone } = await searchParams;
  if (!validateIndianPhone(phone)) {
    redirect("/login");
  }

  const authorization = await authorizeCurrentReporter();
  if (authorization.ok) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Verify your mobile number</h1>
        <div className="mt-6"><OtpForm phone={phone} /></div>
      </section>
    </main>
  );
}
