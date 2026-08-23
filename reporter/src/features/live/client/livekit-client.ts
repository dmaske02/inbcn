import {
  DisconnectReason,
  Room,
  RoomEvent,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";

export type ReporterSessionCredentials = Readonly<{
  serverUrl: string;
  token: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  recordingState: "recording" | "failed";
}>;

type PreviewTracks = Readonly<{ camera: LocalVideoTrack; microphone: LocalAudioTrack }>;
type DisconnectState = "admin-terminated" | "disconnected";
type Events = Readonly<{
  onReconnecting?(): void;
  onReconnected?(): void;
  onRecordingStatusChanged?(isRecording: boolean): void;
  onDisconnected?(reason: DisconnectState): void;
}>;

type BroadcastRoom = Pick<Room, "connect" | "disconnect" | "localParticipant" | "off" | "on">;

function disconnectState(reason: DisconnectReason | undefined): DisconnectState {
  return reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.PARTICIPANT_REMOVED
    ? "admin-terminated"
    : "disconnected";
}

export function createLiveKitBroadcastClient(createRoom: () => BroadcastRoom = () => new Room({ dynacast: true })) {
  let room: BroadcastRoom | null = null;
  let handlers: Array<readonly [RoomEvent, (...args: never[]) => void]> = [];

  function unregister() {
    if (!room) return;
    for (const [event, handler] of handlers) room.off(event, handler);
    handlers = [];
  }

  return {
    async connect(credentials: ReporterSessionCredentials, tracks: PreviewTracks, events: Events) {
      await this.disconnect();
      room = createRoom();
      handlers = [
        [RoomEvent.Reconnecting, events.onReconnecting ?? (() => undefined)],
        [RoomEvent.Reconnected, events.onReconnected ?? (() => undefined)],
        [RoomEvent.RecordingStatusChanged, ((isRecording: boolean) => {
          events.onRecordingStatusChanged?.(isRecording);
        }) as (...args: never[]) => void],
        [RoomEvent.Disconnected, ((reason: DisconnectReason) => {
          room = null;
          events.onDisconnected?.(disconnectState(reason));
        }) as (...args: never[]) => void],
      ];
      for (const [event, handler] of handlers) room.on(event, handler);
      try {
        await room.connect(credentials.serverUrl, credentials.token, { autoSubscribe: false });
        await room.localParticipant.publishTrack(tracks.camera);
        await room.localParticipant.publishTrack(tracks.microphone);
      } catch (error) {
        unregister();
        await room.disconnect(true);
        room = null;
        throw error;
      }
    },
    async disconnect() {
      if (!room) return;
      const active = room;
      unregister();
      room = null;
      await active.disconnect(true);
    },
  } as const;
}

export type LiveKitBroadcastClient = ReturnType<typeof createLiveKitBroadcastClient>;
