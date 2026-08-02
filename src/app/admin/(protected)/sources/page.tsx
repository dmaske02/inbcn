import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { SourceManagement } from "@/features/admin/imports/source-management";
import { getSourcesDashboard } from "@/features/admin/imports/ingestion.service";
import { canManageNewsData } from "@/features/admin/imports/newsdata.model";

export default async function AdminSourcesPage() {
  const admin = await requireAdminUser();
  if (!canManageNewsData(admin.role)) redirect("/admin/forbidden");
  const view = await getSourcesDashboard(admin);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Editorial CMS</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          NewsData Sources
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Configure the provider filters and localized editorial defaults used
          by manual imports.
        </p>
      </header>
      <SourceManagement view={view} />
    </div>
  );
}
