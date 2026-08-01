import {
  BarChart3,
  BookOpenText,
  FolderTree,
  Newspaper,
  Settings,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { requireAdminUser } from "@/features/admin/auth/server";

const quickActions = [
  { label: "Stories", description: "Story management coming next", icon: Newspaper },
  { label: "Categories", description: "Category tools coming soon", icon: FolderTree },
  { label: "Sources", description: "Source management coming soon", icon: BookOpenText },
  { label: "Analytics", description: "Editorial insights coming soon", icon: BarChart3 },
  { label: "Settings", description: "Workspace settings coming soon", icon: Settings },
] as const;

export default async function AdminDashboardPage() {
  const admin = await requireAdminUser();

  return (
    <div className="space-y-8">
      <section aria-labelledby="dashboard-title">
        <p className="text-sm font-medium text-muted-foreground">Welcome</p>
        <h1 id="dashboard-title" className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          {admin.displayName}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Your secure INBCN editorial workspace is ready. Publishing tools will be introduced in the next milestone.
        </p>
      </section>

      <section aria-labelledby="identity-title">
        <h2 id="identity-title" className="text-lg font-semibold">Account</h2>
        <Card className="mt-4" padding="none">
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display name</dt>
                <dd className="mt-1 text-sm font-medium">{admin.displayName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</dt>
                <dd className="mt-1 break-all text-sm font-medium">{admin.email ?? "Not available"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</dt>
                <dd className="mt-1 text-sm font-medium capitalize">{admin.role}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Language</dt>
                <dd className="mt-1 text-sm font-medium">
                  {admin.preferredLanguage
                    ? `${admin.preferredLanguage.name} (${admin.preferredLanguage.code})`
                    : "Not selected"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-lg font-semibold">Quick actions</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {quickActions.map(({ label, description, icon: Icon }) => (
            <Card key={label} className="opacity-80" padding="none">
              <CardContent className="space-y-3">
                <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                <div>
                  <h3 className="font-medium">{label}</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="activity-title">
        <h2 id="activity-title" className="text-lg font-semibold">Recent activity</h2>
        <Card className="mt-4 border-dashed" padding="none">
          <CardContent className="py-10 text-center">
            <p className="font-medium">No editorial activity yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Activity will appear after publishing tools are enabled.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
