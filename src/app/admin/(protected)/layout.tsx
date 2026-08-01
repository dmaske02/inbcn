import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/admin/auth/actions";
import { requireAdminUser } from "@/features/admin/auth/server";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdminUser();

  return (
    <div className="min-h-svh">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            className="flex items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/admin/dashboard"
          >
            <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">INBCN Editorial</span>
              <span className="block text-xs capitalize text-muted-foreground">
                {admin.role} workspace
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{admin.displayName}</p>
              <p className="text-xs text-muted-foreground">{admin.email}</p>
            </div>
            <form action={logoutAction}>
              <Button aria-label="Sign out" size="sm" variant="outline" type="submit">
                <LogOut aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
