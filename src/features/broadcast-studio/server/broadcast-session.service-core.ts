import { canAccessBroadcastStudio } from "../models/broadcast-session.model.ts";
import type { BroadcastSessionResult } from "../models/broadcast-session.model.ts";
import type { AdminRole } from "../../admin/auth/authorization.model.ts";
import { toBroadcastRoomName } from "../../live-broadcast/broadcast.model.ts";
import type { BroadcastLanguage } from "../../live-broadcast/broadcast.types.ts";

type SessionIdentity = Readonly<{ id: string; role: AdminRole }>;

type BroadcastSessionDependencies = {
  authorize(): Promise<SessionIdentity>;
  createRoom(language: BroadcastLanguage): Promise<unknown>;
  generateBroadcasterToken(input: {
    identity: string;
    language: BroadcastLanguage;
    role: "broadcaster" | "admin";
  }): Promise<string>;
  getServerUrl(): string;
};

export function createBroadcastSessionService(
  dependencies: BroadcastSessionDependencies,
) {
  return {
    async requestSession(
      language: BroadcastLanguage,
    ): Promise<BroadcastSessionResult> {
      const identity = await dependencies.authorize();
      if (!canAccessBroadcastStudio(identity.role)) {
        return {
          ok: false,
          error: {
            code: "access-denied",
            message: "You do not have access to Broadcast Studio.",
          },
        };
      }

      try {
        const serverUrl = dependencies.getServerUrl();
        await dependencies.createRoom(language);
        const token = await dependencies.generateBroadcasterToken({
          identity: identity.id,
          language,
          role: identity.role === "admin" ? "admin" : "broadcaster",
        });
        return {
          ok: true,
          credentials: {
            serverUrl,
            token,
            roomName: toBroadcastRoomName(language),
          },
        };
      } catch {
        return {
          ok: false,
          error: {
            code: "token-failure",
            message: "Broadcast credentials could not be created. Try again.",
          },
        };
      }
    },
  };
}
