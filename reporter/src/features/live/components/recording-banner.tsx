import { recordingAnnouncement } from "../client/broadcast-controller.ts";

export function RecordingBanner({ state }: Readonly<{ state: "recording" | "failed" | null }>) {
  if (!state) return null;
  return <p aria-live="polite" className={state === "recording" ? "rounded-md border border-verified/30 bg-verified/10 p-3 text-sm text-verified" : "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"} role="status">{recordingAnnouncement(state)}</p>;
}
