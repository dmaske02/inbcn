import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "@/features/admin/auth/login-form";
import { getAdminAuthorization } from "@/features/admin/auth/server";

export default async function AdminLoginPage() {
  const authorization = await getAdminAuthorization();
  if (authorization.ok) {
    redirect("/admin/dashboard");
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-3">
        <span className="grid size-11 place-items-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-semibold tracking-tight">INBCN Editorial</p>
          <p className="text-sm text-muted-foreground">Secure newsroom access</p>
        </div>
      </div>

      <Card className="shadow-sm" padding="none">
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Use your authorized newsroom account to continue.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
