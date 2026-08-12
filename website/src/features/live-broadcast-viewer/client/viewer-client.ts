import {
  Room,
  RoomEvent,
  type ConnectionQuality,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

import type { ViewerSession } from "../models/viewer.model.ts";

export type ViewerConnectionEvents = Readonly<{
  onTrack?: (track: RemoteTrack) => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onNetworkQuality?: (quality: ConnectionQuality) => void;
  onOffline?: () => void;
  onError?: (error: unknown) => void;
}>;

type ViewerRoom = Pick<Room, "connect" | "disconnect" | "on" | "off">;

export function createLiveKitViewerClient(
  createRoom: () => ViewerRoom = () => new Room({ adaptiveStream: true }),
) {
  let room: ViewerRoom | null = null;
  let handlers: Array<readonly [RoomEvent, (...args: never[]) => void]> = [];
  const broadcasterTracks = new Set<string>();

  function removeHandlers() {
    if (!room) return;
    for (const [event, handler] of handlers) room.off(event, handler);
    handlers = [];
  }

  return {
    async connect(session: ViewerSession, events: ViewerConnectionEvents) {
      if (room) {
        removeHandlers();
        await room.disconnect();
      }
      broadcasterTracks.clear();
      room = createRoom();

      const trackSubscribed = (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (participant.identity !== session.broadcasterIdentity) return;
        const trackSid = publication.trackSid || track.sid;
        if (trackSid) broadcasterTracks.add(trackSid);
        events.onTrack?.(track);
      };
      const trackUnpublished = (
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (participant.identity !== session.broadcasterIdentity) return;
        broadcasterTracks.delete(publication.trackSid);
        if (broadcasterTracks.size === 0) events.onOffline?.();
      };
      const participantDisconnected = (participant: RemoteParticipant) => {
        if (participant.identity === session.broadcasterIdentity) events.onOffline?.();
      };
      const connectionQualityChanged = (
        quality: ConnectionQuality,
      ) => {
        events.onNetworkQuality?.(quality);
      };
      const disconnected = () => events.onOffline?.();
      const reconnecting = () => events.onReconnecting?.();
      const reconnected = () => events.onReconnected?.();

      handlers = [
        [RoomEvent.TrackSubscribed, trackSubscribed as (...args: never[]) => void],
        [RoomEvent.TrackUnpublished, trackUnpublished as (...args: never[]) => void],
        [RoomEvent.ParticipantDisconnected, participantDisconnected as (...args: never[]) => void],
        [RoomEvent.ConnectionQualityChanged, connectionQualityChanged as (...args: never[]) => void],
        [RoomEvent.Disconnected, disconnected],
        [RoomEvent.Reconnecting, reconnecting],
        [RoomEvent.Reconnected, reconnected],
      ];
      for (const [event, handler] of handlers) room.on(event, handler);

      try {
        await room.connect(session.serverUrl, session.token, {
          autoSubscribe: true,
        });
      } catch (error) {
        events.onError?.(error);
        removeHandlers();
        await room.disconnect();
        room = null;
        throw error;
      }
    },
    async disconnect() {
      if (!room) return;
      const activeRoom = room;
      removeHandlers();
      room = null;
      broadcasterTracks.clear();
      await activeRoom.disconnect();
    },
  };
}

export type LiveKitViewerClient = ReturnType<typeof createLiveKitViewerClient>;
