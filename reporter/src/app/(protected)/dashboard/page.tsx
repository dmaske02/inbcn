import { redirect } from "next/navigation";

import { requireReporterSession } from "@/features/auth/server";
import { authDestination } from "@/features/auth/signup-intent.model";

export default async function DashboardPage() {
  const actor = await requireReporterSession();
  redirect(authDestination("signin", actor.state));
}
