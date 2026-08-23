import { recordingAnnouncement } from "../client/broadcast-controller.ts";

export function RecordingBanner({ state }: Readonly<{ state: "recording" | "failed" | null }>) {
  if (!state) return null;
  return <p aria-live="polite" className={state === "recording" ? "rounded-md bg-muted px-3 py-2 text-sm" : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"} role="status">{recordingAnnouncement(state)}</p>;
}
