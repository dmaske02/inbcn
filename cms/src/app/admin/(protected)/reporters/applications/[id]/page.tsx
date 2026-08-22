import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { ApplicationReview } from "@/features/admin/reporters/application-review";
import { canReviewReporter } from "@/features/admin/reporters/reporter.model";
import { reporterService } from "@/features/admin/reporters/reporter.service";

export default async function ReporterApplicationPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const admin = await requireAdminUser();
  if (!canReviewReporter(admin.role)) redirect("/admin/forbidden");
  const { id } = await params;
  const application = await (await reporterService()).get(admin, id);
  if (!application) notFound();

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="/admin/reporters/applications"
      >
        Back to reporter applications
      </Link>
      <ApplicationReview application={application} />
    </div>
  );
}
