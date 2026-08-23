import { deliverPublicReplay } from "@/features/replays/replay.service";

export const runtime = "nodejs";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(request: Request, { params }: Context) {
  return deliverPublicReplay(request, (await params).id);
}

export async function HEAD(request: Request, { params }: Context) {
  return deliverPublicReplay(request, (await params).id);
}
