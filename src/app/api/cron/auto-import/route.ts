import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { runAutomatedImports } from "@/features/admin/imports/scheduler.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = env.server.autoImport.secret;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.server.autoImport.enabled) {
    return NextResponse.json({ started: false, reason: "disabled" });
  }
  try {
    return NextResponse.json(await runAutomatedImports());
  } catch {
    return NextResponse.json({ error: "Automated import failed." }, { status: 500 });
  }
}
