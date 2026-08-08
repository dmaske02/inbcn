"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Typography } from "@/components/ui/typography";
import type { BroadcastLanguage } from "@/features/live-broadcast/broadcast.types";

import { createBroadcastStudioController } from "../client/broadcast-studio.controller";
import { createLiveKitBroadcastClient } from "../client/livekit-client";
import { createMediaDeviceService } from "../client/media-devices";
import { requestBroadcastSession } from "../server/broadcast-session.service";
import { BroadcastControls } from "./broadcast-controls";
import { CameraPreview } from "./camera-preview";
import { ConnectionStatus } from "./connection-status";
import { DeviceSelector } from "./device-selector";
import { PermissionBanner } from "./permission-banner";
import { StreamTimer } from "./stream-timer";

const languages: ReadonlyArray<Readonly<{ code: BroadcastLanguage; name: string }>> = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "mr", name: "Marathi" },
];

export function BroadcastStudio({
  initialLanguage,
}: Readonly<{ initialLanguage: BroadcastLanguage }>) {
  const [controller] = useState(() => {
    const instance = createBroadcastStudioController({
      media: createMediaDeviceService(),
      livekit: createLiveKitBroadcastClient(),
      requestSession: requestBroadcastSession,
    });
    instance.selectLanguage(initialLanguage);
    return instance;
  });
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void controller.initialize();
    const leave = () => void controller.cleanup();
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      void controller.cleanup();
    };
  }, [controller]);

  useEffect(() => {
    if (snapshot.error) alertRef.current?.focus();
  }, [snapshot.error]);

  const locked = snapshot.status === "connecting" || snapshot.status === "live";
  const unavailable = !snapshot.cameraId || !snapshot.microphoneId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Typography as="h1" variant="headline">Broadcast Studio</Typography>
          <Typography variant="meta">Preview and publish a live INBCN broadcast.</Typography>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionStatus status={snapshot.status} networkStatus={snapshot.networkStatus} />
          <StreamTimer startedAt={snapshot.startedAt} />
        </div>
      </div>

      <PermissionBanner error={snapshot.error} alertRef={alertRef} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader>
            <Typography as="h2" variant="title">Camera preview</Typography>
          </CardHeader>
          <CardContent className="space-y-5">
            <CameraPreview
              track={snapshot.preview?.camera ?? null}
              onError={controller.reportPreviewError}
            />
            <BroadcastControls
              status={snapshot.status}
              hasPreview={snapshot.preview !== null}
              disabled={snapshot.preview !== null && unavailable}
              onPreview={() => void controller.startPreview()}
              onStart={() => void controller.startBroadcast()}
              onStop={() => void controller.stopBroadcast()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Typography as="h2" variant="title">Broadcast setup</Typography>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="broadcast-language" className="text-sm font-medium text-foreground">Language</label>
              <select
                id="broadcast-language"
                value={snapshot.language}
                disabled={locked}
                onChange={(event) => controller.selectLanguage(event.target.value as BroadcastLanguage)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-50"
              >
                {languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
              </select>
              <Typography variant="caption">Room: broadcast-{snapshot.language}</Typography>
            </div>
            <DeviceSelector
              id="broadcast-camera"
              label="Camera"
              devices={snapshot.cameras}
              value={snapshot.cameraId}
              disabled={locked && snapshot.networkStatus === "reconnecting"}
              onChange={(value) => void controller.selectCamera(value)}
            />
            <DeviceSelector
              id="broadcast-microphone"
              label="Microphone"
              devices={snapshot.microphones}
              value={snapshot.microphoneId}
              disabled={locked && snapshot.networkStatus === "reconnecting"}
              onChange={(value) => void controller.selectMicrophone(value)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
