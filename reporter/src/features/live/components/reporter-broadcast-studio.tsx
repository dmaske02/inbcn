"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createBroadcastController } from "../client/broadcast-controller.ts";
import { createLiveKitBroadcastClient } from "../client/livekit-client.ts";
import { requestReporterLiveSession } from "../client/live-session-client.ts";
import { createMediaDeviceService } from "../client/media-devices.ts";
import { BroadcastControls } from "./broadcast-controls.tsx";
import { CameraPreview } from "./camera-preview.tsx";
import { ConnectionStatus } from "./connection-status.tsx";
import { RecordingBanner } from "./recording-banner.tsx";

export function ReporterBroadcastStudio({ requestId }: Readonly<{ requestId: string }>) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [controller] = useState(() => createBroadcastController({
    media: createMediaDeviceService(),
    livekit: createLiveKitBroadcastClient(),
    requestSession: () => requestReporterLiveSession(requestId),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const leave = () => void controller.cleanup();
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("beforeunload", leave); void controller.cleanup(); };
  }, [controller]);
  useEffect(() => { if (state.error) alert.current?.focus(); }, [state.error]);

  return (
    <section className="space-y-5 rounded-lg border border-border bg-background p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Mobile broadcast studio</h1><p className="mt-1 text-sm text-muted-foreground">Camera and microphone only.</p></div>
        <ConnectionStatus phase={state.phase} />
      </header>
      <RecordingBanner state={state.recordingState} />
      <CameraPreview track={state.preview?.camera ?? null} />
      <label className="flex items-start gap-3 rounded-md bg-muted p-3 text-sm">
        <input checked={acknowledged} className="mt-0.5 size-4" onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
        <span>This live broadcast is being recorded. I understand the newsroom will retain the recording.</span>
      </label>
      {state.message ? <p aria-live="polite" className="text-sm" role="status">{state.message}</p> : null}
      {state.error ? <p aria-live="assertive" className="text-sm text-destructive" ref={alert} role="alert" tabIndex={-1}>{state.error.message}</p> : null}
      {state.phase !== "ended" ? <BroadcastControls acknowledged={acknowledged} hasPreview={state.preview !== null} onLeave={() => void controller.leave()} onPreview={() => void controller.startPreview()} onStart={() => void controller.startBroadcast()} phase={state.phase} /> : null}
    </section>
  );
}
