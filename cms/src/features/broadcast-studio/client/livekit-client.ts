import {
  Room,
  RoomEvent,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";

import type { BroadcastSessionCredentials } from "../models/broadcast-session.model.ts";

export type BroadcastConnectionEvents = Readonly<{
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onDisconnected?: () => void;
}>;

export type BroadcastTracks = Readonly<{
  camera: LocalVideoTrack;
  microphone: LocalAudioTrack;
}>;

type BroadcastRoomClient = Pick<
  Room,
  "connect" | "disconnect" | "localParticipant" | "off" | "on" | "switchActiveDevice"
>;

export function createLiveKitBroadcastClient(
  createRoom: () => BroadcastRoomClient = () => new Room({ dynacast: true }),
) {
  let room: BroadcastRoomClient | null = null;
  let registeredEvents: Array<readonly [RoomEvent, () => void]> = [];

  function removeEventHandlers() {
    if (!room) return;
    for (const [event, handler] of registeredEvents) {
      room.off(event, handler);
    }
    registeredEvents = [];
  }

  return {
    async connect(
      credentials: BroadcastSessionCredentials,
      tracks: BroadcastTracks,
      events: BroadcastConnectionEvents,
    ) {
      if (room) {
        removeEventHandlers();
        await room.disconnect(true);
      }
      room = createRoom();
      registeredEvents = [
        [RoomEvent.Reconnecting, events.onReconnecting ?? (() => undefined)],
        [RoomEvent.Reconnected, events.onReconnected ?? (() => undefined)],
        [RoomEvent.Disconnected, events.onDisconnected ?? (() => undefined)],
      ];
      for (const [event, handler] of registeredEvents) room.on(event, handler);

      try {
        await room.connect(credentials.serverUrl, credentials.token, {
          autoSubscribe: false,
        });
        await room.localParticipant.publishTrack(tracks.camera);
        await room.localParticipant.publishTrack(tracks.microphone);
      } catch (error) {
        removeEventHandlers();
        await room.disconnect(true);
        room = null;
        throw error;
      }
    },
    async switchCamera(deviceId: string) {
      if (!room) throw new Error("Broadcast room is not connected.");
      await room.switchActiveDevice("videoinput", deviceId, true);
    },
    async switchMicrophone(deviceId: string) {
      if (!room) throw new Error("Broadcast room is not connected.");
      await room.switchActiveDevice("audioinput", deviceId, true);
    },
    async disconnect() {
      if (!room) return;
      const activeRoom = room;
      removeEventHandlers();
      room = null;
      await activeRoom.disconnect(true);
    },
  };
}

export type LiveKitBroadcastClient = ReturnType<
  typeof createLiveKitBroadcastClient
>;
