import { useEffect, useState } from "react";

import { PlayerBackdrop } from "./player-backdrop";
import { PlayerError } from "./player-error";
import { PlayerLoading } from "./player-loading";
import type { ProviderPlayerProps } from "./player-types";
import { buildYouTubeEmbedUrl } from "./youtube-player.model";

export default function YouTubePlayer({
  videoId,
  autoplay,
  muted,
  poster,
  ariaLabel,
  labels,
}: ProviderPlayerProps & { videoId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("error"), 15_000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  let src: string;
  try {
    src = buildYouTubeEmbedUrl(videoId, { autoplay, muted });
  } catch {
    return <PlayerError message={labels.youtubeUnavailable} />;
  }

  return (
    <div className="absolute inset-0">
      <iframe
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        aria-label={ariaLabel}
        className={`absolute inset-0 size-full border-0 transition-opacity ${state === "ready" ? "opacity-100" : "opacity-0"}`}
        onError={() => setState("error")}
        onLoad={() => setState("ready")}
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        src={src}
        title={ariaLabel}
      />
      {state !== "ready" ? <PlayerBackdrop poster={poster} /> : null}
      {state === "loading" ? <PlayerLoading label={labels.loading} /> : null}
      {state === "error" ? <PlayerError message={labels.youtubeUnavailable} /> : null}
    </div>
  );
}
