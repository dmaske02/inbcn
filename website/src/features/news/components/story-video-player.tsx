"use client";

import { useEffect, useRef } from "react";

import { startMutedStoryVideoPlayback } from "@/components/common/story-preview-media.model";

type StoryVideoPlayerProps = Readonly<{
  autoPlay: boolean;
  label: string;
  mimeType: string;
  src: string;
  unsupportedLabel: string;
}>;

export function StoryVideoPlayer({
  autoPlay,
  label,
  mimeType,
  src,
  unsupportedLabel,
}: StoryVideoPlayerProps) {
  const playerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!autoPlay || !playerRef.current) return;
    void startMutedStoryVideoPlayback(playerRef.current);
  }, [autoPlay]);

  return (
    <video
      aria-label={label}
      autoPlay={autoPlay}
      className="size-full object-contain"
      controls
      muted={autoPlay}
      playsInline
      preload="metadata"
      ref={playerRef}
    >
      <source src={src} type={mimeType} />
      {unsupportedLabel}
    </video>
  );
}
