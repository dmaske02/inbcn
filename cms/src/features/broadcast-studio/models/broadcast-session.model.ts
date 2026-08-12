import type { AdminRole } from "../../admin/auth/authorization.model.ts";
import type { BroadcastLanguage } from "../../live-broadcast/broadcast.types.ts";

export type BroadcastStudioStatus =
  | "idle"
  | "preview"
  | "connecting"
  | "live"
  | "disconnected"
  | "error";

export type BroadcastNetworkStatus =
  | "idle"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type BroadcastStudioErrorCode =
  | "access-denied"
  | "camera-denied"
  | "camera-unavailable"
  | "microphone-denied"
  | "microphone-unavailable"
  | "no-devices"
  | "insecure-context"
  | "token-failure"
  | "connection-failure"
  | "device-switch-failure";

export type BroadcastStudioError = Readonly<{
  code: BroadcastStudioErrorCode;
  message: string;
}>;

export type BroadcastSessionCredentials = Readonly<{
  serverUrl: string;
  token: string;
  roomName: `broadcast-${BroadcastLanguage}`;
}>;

export type BroadcastSessionResult =
  | Readonly<{ ok: true; credentials: BroadcastSessionCredentials }>
  | Readonly<{ ok: false; error: BroadcastStudioError }>;

export type BroadcastStudioState = Readonly<{
  status: BroadcastStudioStatus;
  networkStatus: BroadcastNetworkStatus;
  startedAt: number | null;
  error: BroadcastStudioError | null;
}>;

export type BroadcastStudioEvent =
  | Readonly<{ type: "reset" }>
  | Readonly<{ type: "preview-ready" }>
  | Readonly<{ type: "connecting" }>
  | Readonly<{ type: "connected"; startedAt: number }>
  | Readonly<{ type: "reconnecting" }>
  | Readonly<{ type: "reconnected" }>
  | Readonly<{ type: "disconnected" }>
  | Readonly<{ type: "failed"; error: BroadcastStudioError }>;

export const initialBroadcastStudioState: BroadcastStudioState = Object.freeze({
  status: "idle",
  networkStatus: "idle",
  startedAt: null,
  error: null,
});

export function canAccessBroadcastStudio(role: AdminRole): boolean {
  return role === "editor" || role === "admin";
}

export function reduceBroadcastStudioState(
  state: BroadcastStudioState,
  event: BroadcastStudioEvent,
): BroadcastStudioState {
  switch (event.type) {
    case "reset":
      return initialBroadcastStudioState;
    case "preview-ready":
      return { status: "preview", networkStatus: "idle", startedAt: null, error: null };
    case "connecting":
      return { ...state, status: "connecting", error: null };
    case "connected":
      return {
        status: "live",
        networkStatus: "connected",
        startedAt: event.startedAt,
        error: null,
      };
    case "reconnecting":
      return { ...state, status: "connecting", networkStatus: "reconnecting", error: null };
    case "reconnected":
      return { ...state, status: "live", networkStatus: "connected", error: null };
    case "disconnected":
      return {
        status: "disconnected",
        networkStatus: "disconnected",
        startedAt: null,
        error: null,
      };
    case "failed":
      return { ...state, status: "error", networkStatus: "disconnected", error: event.error };
  }
}

export function formatBroadcastDuration(
  startedAt: number | null,
  now: number,
): string {
  const totalSeconds = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
