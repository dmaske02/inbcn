"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createBroadcastController } from "../client/broadcast-controller.ts";
import { createLiveKitBroadcastClient } from "../client/livekit-client.ts";
import { requestReporterLiveSession } from "../client/live-session-client.ts";
import { createMediaDeviceService } from "../client/media-devices.ts";
import { BroadcastControls } from "./broadcast-controls.tsx";
import { CameraPreview } from "./camera-preview.tsx";
import { ConnectionStatus } from "./connection-status.tsx";
import { RecordingBanner } from "./recording-banner.tsx";

type StudioRequest = Readonly<{
  id: string;
  title: string;
  intendedLocality: string;
  expectedDurationMinutes: number;
  approvedStartsAt: string | null;
  approvedEndsAt: string | null;
}>;

function date(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function ReporterBroadcastStudio({ request }: Readonly<{ request: StudioRequest }>) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [controller] = useState(() => createBroadcastController({
    media: createMediaDeviceService(),
    livekit: createLiveKitBroadcastClient(),
    requestSession: () => requestReporterLiveSession(request.id),
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
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Broadcast studio</p>
          <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight" id="studio-heading">{request.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{request.intendedLocality} · Camera and microphone only</p>
        </div>
        <Badge className="w-fit shrink-0" state="approved">Approved</Badge>
      </header>

      <Card>
        <CardHeader><h2 className="text-lg font-semibold">Approved window</h2></CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Approved start</dt><dd className="mt-1 font-medium">{request.approvedStartsAt ? <time dateTime={request.approvedStartsAt}>{date(request.approvedStartsAt)}</time> : "—"}</dd></div>
            <div><dt className="text-muted-foreground">Approved end</dt><dd className="mt-1 font-medium">{request.approvedEndsAt ? <time dateTime={request.approvedEndsAt}>{date(request.approvedEndsAt)}</time> : "—"}</dd></div>
            <div><dt className="text-muted-foreground">Requested duration</dt><dd className="mt-1 font-medium">{request.expectedDurationMinutes} minutes</dd></div>
            <div className="sm:col-span-3"><dt className="text-muted-foreground">Intended locality</dt><dd className="mt-1 font-medium">{request.intendedLocality}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <section aria-labelledby="studio-heading">
          <CardHeader className="sm:flex sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div><h2 className="text-lg font-semibold">Live camera</h2><p className="mt-1 text-sm text-muted-foreground">Check the preview before starting the broadcast.</p></div>
            <ConnectionStatus phase={state.phase} />
          </CardHeader>
          <CardContent className="space-y-5">
            <RecordingBanner state={state.recordingState} />
            <CameraPreview track={state.preview?.camera ?? null} />
            <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <input checked={acknowledged} className="mt-0.5 size-5 shrink-0 accent-primary" onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
              <span>This live broadcast is being recorded. I understand the newsroom will retain the recording.</span>
            </label>
            {state.message ? <p aria-live="polite" className="rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">{state.message}</p> : null}
            {state.error ? <p aria-live="assertive" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" ref={alert} role="alert" tabIndex={-1}>{state.error.message}</p> : null}
            {state.phase !== "ended" ? <div className="border-t border-border pt-5"><BroadcastControls acknowledged={acknowledged} hasPreview={state.preview !== null} onLeave={() => void controller.leave()} onPreview={() => void controller.startPreview()} onStart={() => void controller.startBroadcast()} phase={state.phase} /></div> : null}
          </CardContent>
        </section>
      </Card>
    </div>
  );
}
