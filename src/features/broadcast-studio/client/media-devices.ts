import {
  Room,
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

type MediaDeviceSdk = {
  getLocalDevices(
    kind: MediaDeviceKind,
    requestPermissions?: boolean,
  ): Promise<Array<Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">>>;
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

export function createMediaDeviceService(
  sdk: MediaDeviceSdk = {
    getLocalDevices: Room.getLocalDevices,
    createLocalVideoTrack,
    createLocalAudioTrack,
  },
) {
  return {
    async listDevices(): Promise<StudioDeviceList> {
      const [cameras, microphones] = await Promise.all([
        sdk.getLocalDevices("videoinput", false),
        sdk.getLocalDevices("audioinput", false),
      ]);
      return {
        cameras: mapDevices(cameras, "Camera"),
        microphones: mapDevices(microphones, "Microphone"),
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
