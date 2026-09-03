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
    <div className="grid gap-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Homepage management</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Homepage Builder</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Arrange and configure the live localized homepage through a visual editorial workspace.
        </p>
      </header>
      <HomepageBuilderWorkspace
        canManage={view.canManage}
        locale={view.locale}
        sections={view.sections}
      />
    </div>
  );
}
