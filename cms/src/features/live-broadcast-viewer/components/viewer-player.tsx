"use client";

import { useEffect, useRef } from "react";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import type { RemoteTrack } from "livekit-client";

export function ViewerPlayer({
  videoTrack,
  audioTrack,
  muted,
  onToggleMute,
}: Readonly<{
  videoTrack: RemoteTrack | null;
  audioTrack: RemoteTrack | null;
  muted: boolean;
  onToggleMute(): void;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!videoTrack || !element) return;
    videoTrack.attach(element);
    return () => { videoTrack.detach(element); };
  }, [videoTrack]);

  useEffect(() => {
    const element = audioRef.current;
    if (!audioTrack || !element) return;
    audioTrack.attach(element);
    return () => { audioTrack.detach(element); };
  }, [audioTrack]);

  return (
    <div ref={containerRef} className="relative aspect-video overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Reporter live video"
        className="size-full object-contain"
      />
      <audio ref={audioRef} autoPlay muted={muted} />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
        <span className="inline-flex items-center gap-2 bg-[#b3261e] px-2 py-1 text-[10px] font-bold tracking-[0.16em] text-white">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-white" /> LIVE
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute live broadcast" : "Mute live broadcast"}
            className="grid size-11 place-items-center border border-white/50 text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
          >
            {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => void containerRef.current?.requestFullscreen()}
            aria-label="Enter fullscreen"
            className="grid size-11 place-items-center border border-white/50 text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
          >
            <Maximize aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
