export type PlayerPoster = Readonly<{
  src: string;
  alt: string;
  unoptimized: boolean;
}>;

export type PlayerLabels = Readonly<{
  play: string;
  loading: string;
  offline: string;
  unavailable: string;
  unsupported: string;
  youtubeUnavailable: string;
  hlsUnavailable: string;
}>;

export type ProviderPlayerProps = Readonly<{
  autoplay: boolean;
  muted: boolean;
  poster: PlayerPoster;
  ariaLabel: string;
  labels: PlayerLabels;
}>;
