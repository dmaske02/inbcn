export const BROADCAST_LANGUAGES = ["en", "hi", "mr"] as const;

export type BroadcastLanguage = (typeof BROADCAST_LANGUAGES)[number];
export type BroadcastRole = "broadcaster" | "viewer" | "admin";
export type BroadcastRoomName = `broadcast-${BroadcastLanguage}`;

export type BroadcastTokenInput = {
  identity: string;
  language: BroadcastLanguage;
  role: BroadcastRole;
};

export type BroadcastRoomOptions = {
  emptyTimeout?: number;
  maxParticipants?: number;
};

export type BroadcastRoomCreateInput = BroadcastRoomOptions & {
  name: BroadcastRoomName;
};

export type BroadcastRoomRecord = {
  sid: string;
  name: string;
  participantCount: number;
};

export type BroadcastRoom = BroadcastRoomRecord & {
  name: BroadcastRoomName;
  language: BroadcastLanguage;
};

export type BroadcastRepository = {
  createRoom(input: BroadcastRoomCreateInput): Promise<BroadcastRoomRecord>;
  deleteRoom(name: BroadcastRoomName): Promise<void>;
  listRooms(): Promise<BroadcastRoomRecord[]>;
};

export type LiveKitCredentials = {
  apiKey: string;
  apiSecret: string;
};
