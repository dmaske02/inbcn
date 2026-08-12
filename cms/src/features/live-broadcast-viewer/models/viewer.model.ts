import type { BroadcastLanguage, BroadcastRoomName } from "../../live-broadcast/broadcast.types.ts";
import { toBroadcastRoomName } from "../../live-broadcast/broadcast.model.ts";

export type ViewerParticipant = Readonly<{
  identity: string;
  state: number;
  attributes: Readonly<Record<string, string>>;
  tracks: ReadonlyArray<Readonly<{ type: number }>>;
}>;

export type ViewerSession = Readonly<{
  serverUrl: string;
  token: string;
  roomName: BroadcastRoomName;
  broadcasterIdentity: string;
}>;

export type ViewerSessionResult =
  | Readonly<{ active: true; session: ViewerSession }>
  | Readonly<{ active: false }>;

const PARTICIPANT_ACTIVE = 2;
const AUDIO_TRACK = 0;
const VIDEO_TRACK = 1;

export function toViewerRoomName(language: BroadcastLanguage): BroadcastRoomName {
  return toBroadcastRoomName(language);
}

export function isActiveBroadcaster(participant: ViewerParticipant): boolean {
  const role = participant.attributes.role;
  return (
    participant.state === PARTICIPANT_ACTIVE &&
    (role === "broadcaster" || role === "admin") &&
    participant.tracks.some(
      (track) => track.type === AUDIO_TRACK || track.type === VIDEO_TRACK,
    )
  );
}
