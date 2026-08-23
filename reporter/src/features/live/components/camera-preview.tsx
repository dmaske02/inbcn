"use client";

import { useEffect, useRef } from "react";
import type { LocalVideoTrack } from "livekit-client";

export function CameraPreview({ track }: Readonly<{ track: LocalVideoTrack | null }>) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!track || !element) return;
    track.attach(element);
    void element.play().catch(() => undefined);
    return () => { track.detach(element); };
  }, [track]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
      <video aria-label="Live camera preview" autoPlay className="size-full object-cover" muted playsInline ref={ref} />
      {!track ? <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">Start preview to check your camera and microphone.</p> : null}
    </div>
  );
}
