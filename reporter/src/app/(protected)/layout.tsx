import { requireReporterSession } from "@/features/auth/server";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireReporterSession();
  return <main className="mx-auto min-h-svh w-full max-w-3xl px-4 py-8 sm:px-6">{children}</main>;
}
