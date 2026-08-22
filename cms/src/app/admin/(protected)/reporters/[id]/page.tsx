import { notFound, redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { ReporterDetail } from "@/features/admin/reporters/reporter-directory";
import { canSetReporterTrust } from "@/features/admin/reporters/reporter.model";
import { reporterService } from "@/features/admin/reporters/reporter.service";

export default async function ReporterPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const admin = await requireAdminUser();
  if (!canSetReporterTrust(admin.role)) redirect("/admin/forbidden");
  const { id } = await params;
  const reporter = await (await reporterService()).getReporter(admin, id);
  if (!reporter) notFound();
  return <ReporterDetail application={reporter} now={new Date().toISOString()} />;
}
