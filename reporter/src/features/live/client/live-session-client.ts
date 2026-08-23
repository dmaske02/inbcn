import type { ReporterSessionCredentials } from "./livekit-client.ts";

type SessionResult =
  | Readonly<{ ok: true; credentials: ReporterSessionCredentials }>
  | Readonly<{ ok: false; error: Readonly<{ code: string; message: string }> }>;

function unavailable(): SessionResult {
  return { ok: false, error: { code: "session-unavailable", message: "Your live session is unavailable. Refresh the page and try again." } };
}

export async function requestReporterLiveSession(requestId: string): Promise<SessionResult> {
  try {
    const response = await fetch(`/api/live/${encodeURIComponent(requestId)}/session`, { method: "POST", cache: "no-store" });
    if (!response.ok) return unavailable();
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") return unavailable();
    const session = value as Partial<ReporterSessionCredentials>;
    return typeof session.serverUrl === "string" && typeof session.token === "string"
      && typeof session.roomName === "string" && typeof session.startsAt === "string" && typeof session.endsAt === "string"
      && (session.recordingState === "recording" || session.recordingState === "failed")
      ? { ok: true, credentials: session as ReporterSessionCredentials }
      : unavailable();
  } catch {
    return unavailable();
  }
}
