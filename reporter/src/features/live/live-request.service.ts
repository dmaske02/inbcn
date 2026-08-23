import type { LiveRequestInput } from "./live-request.model.ts";
import type { ReporterLiveRequest } from "./live-request.repository.ts";

type LiveRequestRepository = Readonly<{
  create(profileId: string, input: LiveRequestInput): Promise<ReporterLiveRequest>;
  getAccess(profileId: string): Promise<Readonly<{ status: string; canBroadcastLive: boolean }>>;
  list(profileId: string): Promise<readonly ReporterLiveRequest[]>;
}>;

export class LiveRequestError extends Error {
  readonly code: "FORBIDDEN" | "UNAVAILABLE";

  constructor(code: "FORBIDDEN" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "LiveRequestError";
    this.code = code;
  }
}

function safeError(error: unknown): LiveRequestError {
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("REPORTER_LIVE") || detail.includes("new row violates row-level security")) {
    return new LiveRequestError("FORBIDDEN", "Your current membership and live trust must be active to request a broadcast.");
  }
  return new LiveRequestError("UNAVAILABLE", "The live request could not be saved. Please try again.");
}

export function createLiveRequestService(repository: LiveRequestRepository) {
  return {
    async create(profileId: string, input: LiveRequestInput) {
      const access = await repository.getAccess(profileId);
      if (access.status !== "active" || !access.canBroadcastLive) {
        throw new LiveRequestError("FORBIDDEN", "Your current membership and live trust must be active to request a broadcast.");
      }
      try {
        return await repository.create(profileId, input);
      } catch (error) {
        throw safeError(error);
      }
    },
    list: (profileId: string) => repository.list(profileId),
  } as const;
}

async function runtimeService() {
  const { liveRequestRepository } = await import("./live-request.repository.ts");
  return createLiveRequestService(liveRequestRepository);
}

export async function createLiveRequest(profileId: string, input: LiveRequestInput) {
  return (await runtimeService()).create(profileId, input);
}

export async function getLiveRequests(profileId: string) {
  return (await runtimeService()).list(profileId);
}
