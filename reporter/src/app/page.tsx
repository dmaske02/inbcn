import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { ReporterDemo } from "@/features/demo/reporter-demo";

export default function Home() {
  if (env.server.temporaryOnboarding) redirect("/login");
  return <ReporterDemo />;
}
