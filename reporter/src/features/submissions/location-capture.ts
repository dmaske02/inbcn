import { isFreshCapture, type CapturedLocation } from "./submission.model.ts";

type GeolocationFailure = Readonly<{ code: number }>;
type Geolocation = Readonly<{
  getCurrentPosition(
    success: (position: Readonly<{ coords: Readonly<{ latitude: number; longitude: number; accuracy: number }> }>) => void,
    failure?: (error: GeolocationFailure) => void,
    options?: PositionOptions,
  ): void;
}>;

export function mapGeolocationError(error: GeolocationFailure): string {
  if (error.code === 1) return "Location permission is required. Please allow location access and try again.";
  if (error.code === 2) return "Current location is unavailable. Move to a better signal and try again.";
  if (error.code === 3) return "Location capture timed out. Try again while keeping this page open.";
  return "Current location could not be captured. Try again.";
}

export function shouldRequestAutomaticLocation(input: Readonly<{
  canSubmit: boolean;
  attemptStarted: boolean;
  location: CapturedLocation | null;
  now: string | number | Date;
}>): boolean {
  return input.canSubmit
    && !input.attemptStarted
    && (!input.location || !isFreshCapture(input.location.capturedAt, input.now));
}

export async function captureCurrentLocation(options: Readonly<{
  geolocation?: Geolocation | null;
  now?: () => Date;
}> = {}): Promise<CapturedLocation> {
  const geolocation = options.geolocation ?? (typeof navigator === "undefined" ? null : navigator.geolocation);
  if (!geolocation) throw new Error("Location is unavailable in this browser. Use a browser that supports location capture.");
  const now = options.now ?? (() => new Date());
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition((position) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 10_000) {
        reject(new Error("Current location could not be captured. Try again."));
        return;
      }
      resolve({ latitude, longitude, accuracy, capturedAt: now().toISOString() });
    }, (error) => reject(new Error(mapGeolocationError(error))), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    });
  });
}
