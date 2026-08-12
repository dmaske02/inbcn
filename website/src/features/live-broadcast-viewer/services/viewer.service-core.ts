import type { BroadcastLanguage, BroadcastRoom } from "../../live-broadcast/broadcast.types.ts";
import {
  isActiveBroadcaster,
  toViewerRoomName,
  type ViewerParticipant,
  type ViewerSessionResult,
} from "../models/viewer.model.ts";

type ViewerServiceDependencies = Readonly<{
  listActiveRooms(): Promise<BroadcastRoom[]>;
  listParticipants(roomName: string): Promise<ViewerParticipant[]>;
  generateViewerToken(input: {
    identity: string;
    language: BroadcastLanguage;
    role: "viewer";
  }): Promise<string>;
  getServerUrl(): string;
  createViewerIdentity(): string;
}>;

export function createViewerSessionService(
  dependencies: ViewerServiceDependencies,
) {
  return {
    async getViewerSession(
      language: BroadcastLanguage,
    ): Promise<ViewerSessionResult> {
      try {
        const roomName = toViewerRoomName(language);
        const rooms = await dependencies.listActiveRooms();
        if (!rooms.some((room) => room.name === roomName)) {
          return { active: false };
        }

        const participants = await dependencies.listParticipants(roomName);
        const broadcaster = participants.find(isActiveBroadcaster);
        if (!broadcaster) return { active: false };

        const serverUrl = dependencies.getServerUrl();
        const token = await dependencies.generateViewerToken({
          identity: dependencies.createViewerIdentity(),
          language,
          role: "viewer",
        });
        return {
          active: true,
          session: {
            serverUrl,
            token,
            roomName,
            broadcasterIdentity: broadcaster.identity,
          },
        };
      } catch {
        return { active: false };
      }
    },
  };
}
