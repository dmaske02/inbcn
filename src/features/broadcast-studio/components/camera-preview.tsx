"use client";

import { useEffect, useRef } from "react";
import type { LocalVideoTrack } from "livekit-client";

type CameraPreviewProps = Readonly<{ track: LocalVideoTrack | null }>;

export function CameraPreview({ track }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!track || !element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label="Live camera preview"
        className="size-full object-cover"
      />
      {!track ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
          Start preview to check your camera and microphone.
        </div>
      ) : null}
    </div>
  );
}
