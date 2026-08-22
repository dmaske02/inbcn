import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { ApplicationList } from "@/features/admin/reporters/application-list";
import { canReviewReporter } from "@/features/admin/reporters/reporter.model";
import { reporterService } from "@/features/admin/reporters/reporter.service";

export default async function ReporterApplicationsPage() {
  const admin = await requireAdminUser();
  if (!canReviewReporter(admin.role)) redirect("/admin/forbidden");
  const applications = await (await reporterService()).list(admin);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Administrator workspace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reporter applications</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Review identity, consent, payment, membership, and access synchronization records.
        </p>
      </header>
      <ApplicationList applications={applications} />
    </div>
  );
}
