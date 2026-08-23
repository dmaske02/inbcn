import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";

export type PreviewTracks = Readonly<{
  camera: LocalVideoTrack;
  microphone: LocalAudioTrack;
}>;

export class ReporterMediaError extends Error {
  readonly code: "camera-denied" | "camera-unavailable";

  constructor(code: "camera-denied" | "camera-unavailable") {
    super(code);
    this.code = code;
  }
}

function mediaError(error: unknown): ReporterMediaError {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
    ? new ReporterMediaError("camera-denied")
    : new ReporterMediaError("camera-unavailable");
}

export function createMediaDeviceService() {
  return {
    async createPreview(): Promise<PreviewTracks> {
      let camera: LocalVideoTrack;
      try {
        camera = await createLocalVideoTrack({ facingMode: "environment" });
      } catch (error) {
        throw mediaError(error);
      }
      try {
        return { camera, microphone: await createLocalAudioTrack() };
      } catch (error) {
        camera.stop();
        throw mediaError(error);
      }
    },
    stopPreview(preview: PreviewTracks) {
      preview.camera.stop();
      preview.microphone.stop();
    },
  } as const;
}

export type MediaDeviceService = ReturnType<typeof createMediaDeviceService>;
