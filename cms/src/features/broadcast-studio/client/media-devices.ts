import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";

import type { BroadcastStudioErrorCode } from "../models/broadcast-session.model.ts";

export type StudioDevice = Readonly<{ id: string; label: string }>;

export type StudioDeviceList = Readonly<{
  cameras: StudioDevice[];
  microphones: StudioDevice[];
}>;

export type StudioDeviceSelection = Readonly<{
  cameraId: string;
  microphoneId: string;
}>;

export type StudioPreviewTracks = Readonly<{
  camera: LocalVideoTrack;
  microphone: LocalAudioTrack;
}>;

type BrowserMediaSdk = {
  mediaDevices: Pick<
    MediaDevices,
    "enumerateDevices" | "getUserMedia" | "ondevicechange"
  > | null;
  isSecureContext(): boolean;
  getHostname(): string;
  createLocalVideoTrack: typeof createLocalVideoTrack;
  createLocalAudioTrack: typeof createLocalAudioTrack;
};

export class StudioMediaError extends Error {
  readonly code: BroadcastStudioErrorCode;

  constructor(
    code: BroadcastStudioErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StudioMediaError";
    this.code = code;
  }
}

function isPermissionDenied(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
  );
}

function mediaAccessError(error: unknown): StudioMediaError {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
      return new StudioMediaError("camera-denied", "Camera permission denied", { cause: error });
    case "NotFoundError":
      return new StudioMediaError("no-devices", "No camera or microphone was found.", { cause: error });
    case "NotReadableError":
      return new StudioMediaError(
        "camera-unavailable",
        "Camera or microphone is already in use or unavailable.",
        { cause: error },
      );
    case "SecurityError":
      return new StudioMediaError(
        "insecure-context",
        "Camera and microphone access requires a secure connection.",
        { cause: error },
      );
    default:
      return new StudioMediaError(
        "camera-unavailable",
        "Camera and microphone could not be initialized.",
        { cause: error },
      );
  }
}

function deviceError(kind: "camera" | "microphone", error: unknown) {
  if (isPermissionDenied(error)) {
    return new StudioMediaError(
      `${kind}-denied`,
      `Allow ${kind} access in your browser settings and try again.`,
      { cause: error },
    );
  }
  return new StudioMediaError(
    `${kind}-unavailable`,
    `The selected ${kind} is unavailable. Select another device and try again.`,
    { cause: error },
  );
}

function mapDevices(
  devices: Array<Pick<MediaDeviceInfo, "deviceId" | "label">>,
  fallback: string,
): StudioDevice[] {
  return devices.map((device, index) => ({
    id: device.deviceId,
    label: device.label.trim() || `${fallback} ${index + 1}`,
  }));
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function defaultBrowserMediaSdk(): BrowserMediaSdk {
  return {
    mediaDevices:
      typeof navigator === "undefined" ? null : navigator.mediaDevices ?? null,
    isSecureContext: () =>
      typeof window !== "undefined" && window.isSecureContext,
    getHostname: () =>
      typeof window === "undefined" ? "" : window.location.hostname,
    createLocalVideoTrack,
    createLocalAudioTrack,
  };
}

export function createMediaDeviceService(
  sdk: BrowserMediaSdk = defaultBrowserMediaSdk(),
) {
  function requireMediaDevices() {
    if (
      (!sdk.isSecureContext() && !isLocalHostname(sdk.getHostname())) ||
      !sdk.mediaDevices
    ) {
      throw new StudioMediaError(
        "insecure-context",
        "Camera and microphone access requires HTTPS or localhost.",
      );
    }
    return sdk.mediaDevices;
  }

  async function enumerate(): Promise<StudioDeviceList> {
    try {
      const devices = await requireMediaDevices().enumerateDevices();
      return {
        cameras: mapDevices(
          devices.filter((device) => device.kind === "videoinput"),
          "Camera",
        ),
        microphones: mapDevices(
          devices.filter((device) => device.kind === "audioinput"),
          "Microphone",
        ),
      };
    } catch (error) {
      if (error instanceof StudioMediaError) throw error;
      throw mediaAccessError(error);
    }
  }

  return {
    async listDevices(): Promise<StudioDeviceList> {
      let permissionStream: Pick<MediaStream, "getTracks">;
      try {
        permissionStream = await requireMediaDevices().getUserMedia({
          video: true,
          audio: true,
        });
      } catch (error) {
        if (error instanceof StudioMediaError) throw error;
        throw mediaAccessError(error);
      }
      for (const track of permissionStream.getTracks()) track.stop();
      return enumerate();
    },
    refreshDevices: enumerate,
    watchDevices(listener: () => void) {
      const mediaDevices = requireMediaDevices();
      mediaDevices.ondevicechange = listener;
      return () => {
        if (mediaDevices.ondevicechange === listener) {
          mediaDevices.ondevicechange = null;
        }
      };
    },
    async createPreview(
      selection: StudioDeviceSelection,
    ): Promise<StudioPreviewTracks> {
      let camera: LocalVideoTrack;
      try {
        camera = await sdk.createLocalVideoTrack({
          deviceId: { exact: selection.cameraId },
        });
      } catch (error) {
        throw deviceError("camera", error);
      }

      try {
        const microphone = await sdk.createLocalAudioTrack({
          deviceId: { exact: selection.microphoneId },
        });
        return { camera, microphone };
      } catch (error) {
        camera.stop();
        throw deviceError("microphone", error);
      }
    },
    switchCamera(track: LocalVideoTrack, deviceId: string) {
      return track.setDeviceId(deviceId);
    },
    switchMicrophone(track: LocalAudioTrack, deviceId: string) {
      return track.setDeviceId(deviceId);
    },
    stopPreview(preview: StudioPreviewTracks) {
      preview.camera.stop();
      preview.microphone.stop();
    },
  };
}

export type MediaDeviceService = ReturnType<typeof createMediaDeviceService>;
