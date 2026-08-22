import Link from "next/link";

import { requireReporterSession } from "@/features/auth/server";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireReporterSession();
  return (
    <div className="min-h-svh">
      <header className="border-b border-border bg-background">
        <nav aria-label="Reporter navigation" className="mx-auto flex min-h-14 w-full max-w-3xl items-center gap-1 px-4 sm:px-6">
          <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/dashboard">Dashboard</Link>
          <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/application">Application</Link>
          {actor.state === "reporter" ? (
            <>
              <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/stories">Stories</Link>
              <Link className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/membership">Membership</Link>
            </>
          ) : null}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
