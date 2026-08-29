import Link from "next/link";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { requireReporterSession } from "@/features/auth/server";
import { ReporterMobileNavigation } from "@/features/navigation/reporter-mobile-navigation";
import { ReporterNavigation } from "@/features/navigation/reporter-navigation";

function ReporterMark() {
  return <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24"><path d="M5 4.75h14v14.5H5zM8 8h8M8 11.5h8M8 15h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" /></svg>;
}

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireReporterSession();
  const reporterAccess = actor.state === "reporter";
  return (
    <div className="min-h-svh overflow-x-hidden lg:overflow-x-visible">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3 rounded-sm" href="/dashboard">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><ReporterMark /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">INBCN Reporter</span>
              <span className="block truncate text-xs text-muted-foreground">{reporterAccess ? "Reporter workspace" : "Applicant workspace"}</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <ReporterNavigation className="hidden items-center gap-1 lg:flex" reporterAccess={reporterAccess} />
            <div className="hidden text-right lg:block">
              <p className="text-sm font-medium">{reporterAccess ? "Reporter account" : "Applicant account"}</p>
              <p className="text-xs text-muted-foreground">Authenticated workspace</p>
            </div>
            <form action={logoutAction} className="hidden lg:block">
              <Button aria-label="Log out of Reporter" type="submit" variant="outline">Log out</Button>
            </form>
            <ReporterMobileNavigation reporterAccess={reporterAccess} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
