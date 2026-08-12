"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ConnectionQuality, RemoteTrack } from "livekit-client";

import { createLiveKitViewerClient } from "../client/viewer-client";
import type { ViewerSession } from "../models/viewer.model";
import { ViewerError } from "./viewer-error";
import { ViewerLoading } from "./viewer-loading";
import { ViewerOffline } from "./viewer-offline";
import { ViewerPlayer } from "./viewer-player";

type ViewerState = "loading" | "live" | "reconnecting" | "error" | "offline";

export function LiveViewer({
  session,
  offlineFallback,
}: Readonly<{ session: ViewerSession; offlineFallback: ReactNode }>) {
  const client = useMemo(() => createLiveKitViewerClient(), []);
  const [state, setState] = useState<ViewerState>("loading");
  const [videoTrack, setVideoTrack] = useState<RemoteTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<RemoteTrack | null>(null);
  const [muted, setMuted] = useState(true);
  const [networkQuality, setNetworkQuality] = useState<ConnectionQuality | "unknown">("unknown");

  useEffect(() => {
    let active = true;
    const tracks = new Set<RemoteTrack>();
    const goOffline = () => {
      if (!active) return;
      setState("offline");
      void client.disconnect();
    };

    void client.connect(session, {
      onTrack(track) {
        if (!active) return;
        tracks.add(track);
        if (track.kind === "video") setVideoTrack(track);
        if (track.kind === "audio") setAudioTrack(track);
        setState("live");
      },
      onReconnecting: () => active && setState("reconnecting"),
      onReconnected: () => active && setState("live"),
      onNetworkQuality: (quality) => active && setNetworkQuality(quality),
      onOffline: goOffline,
      onError: () => active && setState("error"),
    }).catch(() => {
      if (active) setState("error");
    });

    return () => {
      active = false;
      for (const track of tracks) track.detach();
      void client.disconnect();
    };
  }, [client, session]);

  if (state === "offline") {
    return <ViewerOffline>{offlineFallback}</ViewerOffline>;
  }

  return (
    <div className="relative overflow-hidden border border-[#14110f] bg-black">
      <ViewerPlayer
        videoTrack={videoTrack}
        audioTrack={audioTrack}
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
      />
      {state === "loading" ? <ViewerLoading /> : null}
      {state === "reconnecting" ? <ViewerLoading reconnecting /> : null}
      {state === "error" ? <ViewerError onShowOffline={() => setState("offline")} /> : null}
      <p className="sr-only" role="status" aria-live="polite">
        {state === "live" ? `Live broadcast. Network quality: ${networkQuality}.` : state}
      </p>
    </div>
  );
}
