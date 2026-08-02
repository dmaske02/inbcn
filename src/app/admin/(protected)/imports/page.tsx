import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { ImportHistory } from "@/features/admin/imports/import-history";
import { getImportDashboard } from "@/features/admin/imports/ingestion.service";
import { canManageNewsData } from "@/features/admin/imports/newsdata.model";

export default async function AdminImportsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ page?: string }> }>) {
  const admin = await requireAdminUser();
  if (!canManageNewsData(admin.role)) redirect("/admin/forbidden");
  const { page } = await searchParams;
  const view = await getImportDashboard(admin, page);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Editorial CMS</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          NewsData Imports
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Fetch recent provider articles as private drafts for editorial review.
          Imports never publish automatically.
        </p>
      </header>
      <ImportHistory view={view} />
    </div>
  );
}
