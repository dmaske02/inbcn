import "server-only";

import { z } from "zod";

import type { AdminIdentity } from "../../auth/authorization.model.ts";
import type { TerminationRequest } from "./live-termination.repository.ts";

type Repository = Readonly<{
  get(id: string): Promise<TerminationRequest | null>;
  terminate(id: string, reason: string): Promise<void>;
}>;

type Cleanup = (input: Readonly<{ roomName: string; profileId: string }>) => Promise<void>;

export class LiveTerminationError extends Error {
  readonly code: "FORBIDDEN" | "INVALID" | "UNAVAILABLE";

  constructor(code: "FORBIDDEN" | "INVALID" | "UNAVAILABLE", message: string) {
    super(message);
    this.code = code;
  }
}

function invalidId(id: string): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new LiveTerminationError("INVALID", "The live request is invalid.");
  return parsed.data.toLowerCase();
}

function reason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 2_000) throw new LiveTerminationError("INVALID", "Enter a reason between 1 and 2000 characters.");
  return normalized;
}

function unavailable(): LiveTerminationError {
  return new LiveTerminationError("UNAVAILABLE", "The live broadcast was ended, but provider cleanup will be retried.");
}

export function createLiveTerminationService(repository: Repository & Readonly<{ cleanup: Cleanup }>) {
  return {
    async terminate(actor: Pick<AdminIdentity, "role">, id: string, value: string): Promise<void> {
      if (actor.role !== "admin") throw new LiveTerminationError("FORBIDDEN", "Only an active administrator can end this broadcast.");
      const requestId = invalidId(id);
      const terminationReason = reason(value);
      let request: TerminationRequest | null;
      try {
        request = await repository.get(requestId);
      } catch {
        throw unavailable();
      }
      if (!request) throw new LiveTerminationError("INVALID", "This live request is no longer available.");
      if (request.status !== "terminated") {
        try {
          await repository.terminate(requestId, terminationReason);
          request = await repository.get(requestId);
        } catch {
          try { request = await repository.get(requestId); } catch { throw unavailable(); }
          if (!request || request.status !== "terminated") throw unavailable();
        }
      }
      if (!request || request.status !== "terminated") throw unavailable();
      if (!request.roomName) return;
      try {
        await repository.cleanup({ roomName: request.roomName, profileId: request.profileId });
      } catch {
        throw unavailable();
      }
    },
  } as const;
}

async function runtimeService() {
  const [{ env }, { RoomServiceClient }, { liveTerminationRepository }, { createLiveKitTerminationProvider }] = await Promise.all([
    import("@/config/env"),
    import("livekit-server-sdk"),
    import("./live-termination.repository.ts"),
    import("./live-termination.provider.ts"),
  ]);
  const { url, apiKey, apiSecret } = env.server.liveKit;
  if (!url || !apiKey || !apiSecret) throw unavailable();
  return createLiveTerminationService({
    ...liveTerminationRepository,
    cleanup: createLiveKitTerminationProvider(new RoomServiceClient(url, apiKey, apiSecret)),
  });
}

export async function terminateReporterLiveRequest(actor: Pick<AdminIdentity, "role">, id: string, reason: string): Promise<void> {
  return (await runtimeService()).terminate(actor, id, reason);
}
