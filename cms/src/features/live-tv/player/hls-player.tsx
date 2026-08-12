import { useEffect, useRef, useState } from "react";

import { PlayerBackdrop } from "./player-backdrop";
import { PlayerError } from "./player-error";
import { PlayerLoading } from "./player-loading";
import type { ProviderPlayerProps } from "./player-types";
import { selectHlsPlaybackEngine } from "./hls-player.model";

export default function HlsPlayer({
  manifestUrl,
  autoplay,
  muted,
  poster,
  ariaLabel,
  labels,
}: ProviderPlayerProps & { manifestUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unsupported" | "error">("loading");

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("error"), 15_000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  useEffect(() => {
    const media = videoRef.current;
    if (!media) return;
    let disposed = false;
    let destroy: () => void = () => undefined;

    async function connect(mediaElement: HTMLVideoElement) {
      try {
        const hlsModule = await import("hls.js");
        if (disposed) return;
        const Hls = hlsModule.default;
        const engine = selectHlsPlaybackEngine({
          hlsJsSupported: Hls.isSupported(),
          nativeSupported: Boolean(mediaElement.canPlayType("application/vnd.apple.mpegurl")),
        });

        if (engine === "unsupported") {
          setState("unsupported");
          return;
        }
        if (engine === "native") {
          mediaElement.src = manifestUrl;
          mediaElement.load();
          return;
        }

        const hls = new Hls();
        let recoveredMediaError = false;
        destroy = () => hls.destroy();
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (disposed) return;
          setState("ready");
          if (autoplay) void mediaElement.play().catch(() => setState("error"));
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (disposed || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
            recoveredMediaError = true;
            hls.recoverMediaError();
            return;
          }
          setState("error");
          hls.destroy();
        });
        hls.loadSource(manifestUrl);
        hls.attachMedia(mediaElement);
      } catch {
        if (!disposed) setState("error");
      }
    }

    void connect(media);
    return () => {
      disposed = true;
      destroy();
      media.removeAttribute("src");
      media.load();
    };
  }, [autoplay, manifestUrl]);

  const message = state === "unsupported" ? labels.unsupported : labels.hlsUnavailable;
  return (
    <div className="absolute inset-0">
      <video
        aria-label={ariaLabel}
        autoPlay={autoplay}
        className="size-full bg-black object-contain"
        controls
        crossOrigin="anonymous"
        muted={muted}
        onCanPlay={() => setState("ready")}
        onError={() => setState("error")}
        playsInline
        poster={poster.src}
        preload="metadata"
        ref={videoRef}
      />
      {state !== "ready" ? <PlayerBackdrop poster={poster} /> : null}
      {state === "loading" ? <PlayerLoading label={labels.loading} /> : null}
      {state === "unsupported" || state === "error" ? <PlayerError message={message} /> : null}
    </div>
  );
}
