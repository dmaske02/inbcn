import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { requireAdminUser } from "@/features/admin/auth/server";
import { ReporterDirectory } from "@/features/admin/reporters/reporter-directory";
import { canSetReporterTrust } from "@/features/admin/reporters/reporter.model";
import { reporterService } from "@/features/admin/reporters/reporter.service";

export default async function ReportersPage() {
  const admin = await requireAdminUser();
  if (!canSetReporterTrust(admin.role)) redirect("/admin/forbidden");
  const reporters = await (await reporterService()).listReporters(admin);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Administrator workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reporter directory</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Manage approved reporter access, membership state, and the two default-off trust capabilities.</p>
        </div>
        <Link className={buttonVariants({ variant: "outline" })} href="/admin/reporters/applications">Review applications</Link>
      </header>
      <ReporterDirectory now={new Date().toISOString()} reporters={reporters} />
    </div>
  );
}
