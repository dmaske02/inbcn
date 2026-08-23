import type { LiveKitBroadcastClient, ReporterSessionCredentials } from "./livekit-client.ts";
import type { MediaDeviceService, PreviewTracks } from "./media-devices.ts";

export type BroadcastState = Readonly<{
  phase: "idle" | "preview" | "connecting" | "live" | "reconnecting" | "ended" | "error";
  preview: PreviewTracks | null;
  recordingState: "recording" | "failed" | null;
  error: Readonly<{ code: string; message: string }> | null;
  message: string | null;
}>;

export const initialBroadcastState: BroadcastState = Object.freeze({
  phase: "idle", preview: null, recordingState: null, error: null, message: null,
});

export type BroadcastEvent =
  | Readonly<{ type: "permissions-granted" }>
  | Readonly<{ type: "connecting" }>
  | Readonly<{ type: "connected"; recordingState: "recording" | "failed" }>
  | Readonly<{ type: "recording-status"; recordingState: "recording" | "failed" }>
  | Readonly<{ type: "reconnecting" }>
  | Readonly<{ type: "reconnected" }>
  | Readonly<{ type: "room-disconnected"; reason: "admin-terminated" | "disconnected" }>
  | Readonly<{ type: "left" }>
  | Readonly<{ type: "failed"; error: BroadcastState["error"] }>;

export function recordingAnnouncement(state: BroadcastState["recordingState"]): string {
  return state === "recording" ? "This live broadcast is being recorded." : "Recording status is unavailable.";
}

export function reduceBroadcast(state: BroadcastState, event: BroadcastEvent): BroadcastState {
  switch (event.type) {
    case "permissions-granted": return { ...state, phase: "preview", error: null, message: null };
    case "connecting": return { ...state, phase: "connecting", error: null, message: null };
    case "connected": return { ...state, phase: "live", recordingState: event.recordingState, error: null, message: null };
    case "reconnecting": return { ...state, phase: "reconnecting", error: null };
    case "reconnected": return { ...state, phase: "live", error: null };
    case "room-disconnected": return event.reason === "admin-terminated"
      ? { ...state, phase: "ended", preview: null, recordingState: null, message: "This broadcast was ended by the newsroom." }
      : { ...state, phase: "idle", preview: null, recordingState: null, message: "The broadcast connection ended. Rejoin only if your approved window is still active." };
    case "recording-status": return { ...state, recordingState: event.recordingState };
    case "left": return initialBroadcastState;
    case "failed": return { ...state, phase: state.preview ? "preview" : "error", error: event.error, message: null };
  }
}

function safeError(error: unknown): NonNullable<BroadcastState["error"]> {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
    return { code: "camera-denied", message: "Allow camera and microphone access in your browser settings, then try again." };
  }
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "camera-denied") return { code, message: "Allow camera and microphone access in your browser settings, then try again." };
  return { code: "broadcast-unavailable", message: "The broadcast could not start. Check your connection and try again." };
}

type Dependencies = Readonly<{
  media: MediaDeviceService;
  livekit: LiveKitBroadcastClient;
  requestSession(): Promise<Readonly<{ ok: true; credentials: ReporterSessionCredentials }> | Readonly<{ ok: false; error: NonNullable<BroadcastState["error"]> }>>;
}>;

export function createBroadcastController({ media, livekit, requestSession }: Dependencies) {
  let state = initialBroadcastState;
  let cleaned = false;
  let generation = 0;
  let previewPending = false;
  let broadcastPending = false;
  const listeners = new Set<() => void>();
  const emit = (next: BroadcastState) => { state = next; for (const listener of listeners) listener(); };
  const transition = (event: BroadcastEvent) => emit(reduceBroadcast(state, event));
  const release = () => {
    if (!state.preview) return;
    media.stopPreview(state.preview);
    emit({ ...state, preview: null });
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async startPreview() {
      if (state.preview || previewPending) return;
      cleaned = false;
      const operation = generation;
      previewPending = true;
      try {
        const preview = await media.createPreview();
        if (operation !== generation) {
          media.stopPreview(preview);
          return;
        }
        emit({ ...state, preview });
        transition({ type: "permissions-granted" });
      } catch (error) {
        if (operation === generation) transition({ type: "failed", error: safeError(error) });
      } finally {
        if (operation === generation) previewPending = false;
      }
    },
    async startBroadcast() {
      if (!state.preview || state.phase !== "preview" || broadcastPending) return;
      const operation = generation;
      broadcastPending = true;
      transition({ type: "connecting" });
      let session;
      try { session = await requestSession(); } catch (error) {
        if (operation === generation) transition({ type: "failed", error: safeError(error) });
        if (operation === generation) broadcastPending = false;
        return;
      }
      if (operation !== generation) return;
      if (!session.ok) { transition({ type: "failed", error: session.error }); broadcastPending = false; return; }
      try {
        await livekit.connect(session.credentials, state.preview, {
          onReconnecting: () => { if (operation === generation) transition({ type: "reconnecting" }); },
          onReconnected: () => { if (operation === generation) transition({ type: "reconnected" }); },
          onRecordingStatusChanged: (isRecording) => { if (operation === generation) transition({ type: "recording-status", recordingState: isRecording ? "recording" : "failed" }); },
          onDisconnected: (reason) => { if (operation === generation) { release(); transition({ type: "room-disconnected", reason }); } },
        });
        if (operation !== generation) { await livekit.disconnect(); return; }
        transition({ type: "connected", recordingState: session.credentials.recordingState });
      } catch (error) {
        if (operation !== generation) { await livekit.disconnect(); return; }
        release();
        transition({ type: "failed", error: safeError(error) });
      } finally {
        if (operation === generation) broadcastPending = false;
      }
    },
    async leave() { generation += 1; previewPending = false; broadcastPending = false; await livekit.disconnect(); release(); cleaned = true; transition({ type: "left" }); },
    async cleanup() {
      if (cleaned) return;
      generation += 1;
      previewPending = false;
      broadcastPending = false;
      await livekit.disconnect();
      release();
      cleaned = true;
      transition({ type: "left" });
    },
  } as const;
}
