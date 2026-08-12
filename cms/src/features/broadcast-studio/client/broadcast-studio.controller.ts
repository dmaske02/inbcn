import type { BroadcastLanguage } from "../../live-broadcast/broadcast.types.ts";
import {
  initialBroadcastStudioState,
  reduceBroadcastStudioState,
  type BroadcastSessionResult,
  type BroadcastStudioError,
  type BroadcastStudioState,
} from "../models/broadcast-session.model.ts";
import type {
  MediaDeviceService,
  StudioDevice,
  StudioPreviewTracks,
} from "./media-devices.ts";
import type { LiveKitBroadcastClient } from "./livekit-client.ts";

export type BroadcastStudioSnapshot = BroadcastStudioState &
  Readonly<{
    cameras: StudioDevice[];
    microphones: StudioDevice[];
    cameraId: string;
    microphoneId: string;
    language: BroadcastLanguage;
    preview: StudioPreviewTracks | null;
  }>;

type ControllerDependencies = Readonly<{
  media: MediaDeviceService;
  livekit: LiveKitBroadcastClient;
  requestSession(language: BroadcastLanguage): Promise<BroadcastSessionResult>;
  now?: () => number;
}>;

function safeError(error: unknown): BroadcastStudioError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  ) {
    return error as BroadcastStudioError;
  }
  if (error instanceof Error) {
    const details = error as Error & {
      code?: string | number;
      reason?: string | number;
      status?: string | number;
    };
    const metadata = [
      details.status === undefined ? null : `status ${details.status}`,
      details.code === undefined ? null : `code ${details.code}`,
      details.reason === undefined ? null : `reason ${details.reason}`,
    ].filter(Boolean);
    return {
      code: "connection-failure",
      message: `${error.message}${metadata.length ? ` (${metadata.join(", ")})` : ""}`,
    };
  }
  return {
    code: "connection-failure",
    message: "The broadcast could not connect. Check the network and try again.",
  };
}

export function createBroadcastStudioController({
  media,
  livekit,
  requestSession,
  now = Date.now,
}: ControllerDependencies) {
  let state: BroadcastStudioSnapshot = {
    ...initialBroadcastStudioState,
    cameras: [],
    microphones: [],
    cameraId: "",
    microphoneId: "",
    language: "en",
    preview: null,
  };
  let active = true;
  let stopWatchingDevices: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function emit(next: BroadcastStudioSnapshot) {
    state = next;
    for (const listener of listeners) listener();
  }

  function transition(event: Parameters<typeof reduceBroadcastStudioState>[1]) {
    emit({ ...state, ...reduceBroadcastStudioState(state, event) });
  }

  function releasePreview() {
    if (!state.preview) return;
    media.stopPreview(state.preview);
    emit({ ...state, preview: null });
  }

  function withDevices(
    devices: Awaited<ReturnType<MediaDeviceService["refreshDevices"]>>,
  ): BroadcastStudioSnapshot {
    return {
      ...state,
      ...devices,
      cameraId: devices.cameras.some((device) => device.id === state.cameraId)
        ? state.cameraId
        : devices.cameras[0]?.id ?? "",
      microphoneId: devices.microphones.some(
        (device) => device.id === state.microphoneId,
      )
        ? state.microphoneId
        : devices.microphones[0]?.id ?? "",
    };
  }

  async function refreshDevices() {
    try {
      const devices = await media.refreshDevices();
      const next = withDevices(devices);
      if (!devices.cameras.length || !devices.microphones.length) {
        emit(next);
        transition({
          type: "failed",
          error: {
            code: "no-devices",
            message: "A camera and microphone are required to broadcast.",
          },
        });
        return;
      }
      emit(
        state.error?.code === "no-devices"
          ? { ...next, ...initialBroadcastStudioState }
          : next,
      );
    } catch (error) {
      transition({ type: "failed", error: safeError(error) });
    }
  }

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async initialize() {
      active = true;
      try {
        const devices = await media.listDevices();
        if (!stopWatchingDevices) {
          stopWatchingDevices = media.watchDevices(refreshDevices);
        }
        if (!devices.cameras.length || !devices.microphones.length) {
          transition({
            type: "failed",
            error: {
              code: "no-devices",
              message: "A camera and microphone are required to broadcast.",
            },
          });
          return;
        }
        emit(withDevices(devices));
      } catch (error) {
        transition({ type: "failed", error: safeError(error) });
      }
    },
    async startPreview() {
      try {
        if (!state.cameraId || !state.microphoneId) {
          const devices = await media.listDevices();
          if (!stopWatchingDevices) {
            stopWatchingDevices = media.watchDevices(refreshDevices);
          }
          const next = withDevices(devices);
          if (!next.cameraId || !next.microphoneId) {
            emit(next);
            transition({
              type: "failed",
              error: {
                code: "no-devices",
                message: "A camera and microphone are required to broadcast.",
              },
            });
            return;
          }
          emit(next);
        }
        const preview = await media.createPreview({
          cameraId: state.cameraId,
          microphoneId: state.microphoneId,
        });
        emit({ ...state, preview });
        transition({ type: "preview-ready" });
      } catch (error) {
        transition({ type: "failed", error: safeError(error) });
      }
    },
    reportPreviewError(error: unknown) {
      transition({
        type: "failed",
        error: {
          code: "camera-unavailable",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    },
    selectLanguage(language: BroadcastLanguage) {
      if (state.status === "live" || state.status === "connecting") return;
      emit({ ...state, language });
    },
    async selectCamera(cameraId: string) {
      if (!state.preview) return;
      try {
        if (state.status === "live" || state.networkStatus === "reconnecting") {
          await livekit.switchCamera(cameraId);
        } else {
          await media.switchCamera(state.preview.camera, cameraId);
        }
        emit({ ...state, cameraId });
      } catch {
        transition({
          type: "failed",
          error: {
            code: "device-switch-failure",
            message: "The camera could not be switched. Try another device.",
          },
        });
      }
    },
    async selectMicrophone(microphoneId: string) {
      if (!state.preview) return;
      try {
        if (state.status === "live" || state.networkStatus === "reconnecting") {
          await livekit.switchMicrophone(microphoneId);
        } else {
          await media.switchMicrophone(state.preview.microphone, microphoneId);
        }
        emit({ ...state, microphoneId });
      } catch {
        transition({
          type: "failed",
          error: {
            code: "device-switch-failure",
            message: "The microphone could not be switched. Try another device.",
          },
        });
      }
    },
    async startBroadcast() {
      if (!state.preview || state.status !== "preview") return;
      transition({ type: "connecting" });
      const result = await requestSession(state.language);
      if (!result.ok) {
        transition({ type: "failed", error: result.error });
        return;
      }
      try {
        await livekit.connect(result.credentials, state.preview, {
          onReconnecting: () => transition({ type: "reconnecting" }),
          onReconnected: () => transition({ type: "reconnected" }),
          onDisconnected: () => {
            releasePreview();
            transition({ type: "disconnected" });
          },
        });
        transition({ type: "connected", startedAt: now() });
      } catch (error) {
        releasePreview();
        transition({ type: "failed", error: safeError(error) });
      }
    },
    async stopBroadcast() {
      await livekit.disconnect();
      releasePreview();
      transition({ type: "disconnected" });
    },
    async cleanup() {
      if (!active) return;
      active = false;
      stopWatchingDevices?.();
      stopWatchingDevices = null;
      await livekit.disconnect();
      releasePreview();
      transition({ type: "disconnected" });
    },
  };
}

export type BroadcastStudioController = ReturnType<
  typeof createBroadcastStudioController
>;
