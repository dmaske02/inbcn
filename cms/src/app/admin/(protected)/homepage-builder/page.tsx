import { requireAdminUser } from "@/features/admin/auth/server";
import { HomepageBuilderWorkspace } from "@/features/homepage-builder/components/workspace/homepage-builder-workspace";
import { getHomepageEditorWorkspaceView } from "@/features/homepage-builder/homepage-builder.service";

export default async function HomepageBuilderPage({ searchParams }: Readonly<{
  searchParams: Promise<{ locale?: string | string[] }>;
}>) {
  const admin = await requireAdminUser();
  const params = await searchParams;
  const locale = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const view = await getHomepageEditorWorkspaceView(admin, locale ?? "hi");

  return (
    <div>
      <HomepageBuilderWorkspace
        canManage={view.canManage}
        locale={view.locale}
        sections={view.sections}
      />
    </div>
  );
}
