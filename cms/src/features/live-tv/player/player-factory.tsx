import { lazy, Suspense } from "react";

import { OfflinePlayer } from "./offline-player";
import { PlayerBackdrop } from "./player-backdrop";
import { PlayerError } from "./player-error";
import { resolvePlayer, type PlayerInput } from "./player-resolution";
import { PlayerLoading } from "./player-loading";
import type { PlayerLabels, PlayerPoster } from "./player-types";

const YouTubePlayer = lazy(() => import("./youtube-player"));
const HlsPlayer = lazy(() => import("./hls-player"));

export function PlayerFactory({
  playback,
  poster,
  ariaLabel,
  labels,
}: Readonly<{
  playback: PlayerInput;
  poster: PlayerPoster;
  ariaLabel: string;
  labels: PlayerLabels;
}>) {
  const player = resolvePlayer(playback);
  if (player.kind === "offline") return <OfflinePlayer message={labels.offline} poster={poster} />;
  if (player.kind === "error") {
    return <div className="absolute inset-0"><PlayerBackdrop poster={poster} /><PlayerError message={labels.unavailable} /></div>;
  }

  return (
    <Suspense fallback={<PlayerLoading label={labels.loading} />}>
      {player.kind === "youtube" ? (
        <YouTubePlayer {...player} ariaLabel={ariaLabel} labels={labels} poster={poster} />
      ) : (
        <HlsPlayer {...player} ariaLabel={ariaLabel} labels={labels} poster={poster} />
      )}
    </Suspense>
  );
}
