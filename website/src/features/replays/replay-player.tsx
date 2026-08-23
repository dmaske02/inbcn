import type { PublicReplay } from "./replay.model";

export function ReplayPlayer({
  replay,
  label,
  fallback,
}: Readonly<{ replay: PublicReplay; label: string; fallback: string }>) {
  return (
    <video
      aria-label={label}
      className="aspect-video w-full bg-black"
      controls
      playsInline
      poster={replay.thumbnail.url}
      preload="metadata"
    >
      <source src={replay.playbackUrl} type="video/mp4" />
      {fallback} <a href={replay.playbackUrl}>{replay.title}</a>
    </video>
  );
}
