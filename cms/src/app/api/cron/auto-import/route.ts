import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { runAutomatedImports } from "@/features/admin/imports/scheduler.service";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const secrets = [
    env.server.autoImport.secret,
    process.env.CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret));

  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

async function handleAutomatedImport(request: Request) {
  if (!isAuthorized(request)) {
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

export async function GET(request: Request) {
  return handleAutomatedImport(request);
}

export async function POST(request: Request) {
  return handleAutomatedImport(request);
}
