export const SUPPORTED_LIVE_STREAM_PROVIDERS = ["youtube", "hls"] as const;

export type LiveStreamProvider =
  (typeof SUPPORTED_LIVE_STREAM_PROVIDERS)[number];

export type ProviderCapabilities = Readonly<{
  delivery: "iframe" | "media";
  nativeControls: boolean;
  captions: boolean;
  pictureInPicture: boolean;
  externalFallback: boolean;
  requiresRuntime: boolean;
}>;

export type PlaybackPolicyInput = Readonly<{
  autoplay?: boolean;
  muted?: boolean;
}>;

export type PlaybackPolicy = Readonly<{
  autoplay: boolean;
  muted: boolean;
}>;

export type ProviderPolicy = Readonly<{
  allowedHosts: Readonly<{
    youtube: readonly string[];
    hls: readonly string[];
  }>;
  autoplay: Readonly<{
    defaultEnabled: boolean;
    requiresMuted: boolean;
  }>;
  muted: Readonly<{
    defaultEnabled: boolean;
  }>;
}>;

export type ProviderPolicyOverride = Readonly<{
  allowedHosts?: Readonly<{
    youtube?: readonly string[];
    hls?: readonly string[];
  }>;
  autoplay?: Partial<ProviderPolicy["autoplay"]>;
  muted?: Partial<ProviderPolicy["muted"]>;
}>;

type ProviderConfigurationBase = PlaybackPolicyInput &
  Readonly<{
    source: string;
    externalWatchUrl?: string | null;
  }>;

export type YouTubeProviderConfigurationInput = ProviderConfigurationBase &
  Readonly<{ provider: "youtube" }>;

export type HlsProviderConfigurationInput = ProviderConfigurationBase &
  Readonly<{ provider: "hls" }>;

export type ProviderConfigurationInput =
  | YouTubeProviderConfigurationInput
  | HlsProviderConfigurationInput;

export type YouTubeProviderConfiguration = PlaybackPolicy &
  Readonly<{
    provider: "youtube";
    videoId: string;
    externalWatchUrl: string | null;
  }>;

export type HlsProviderConfiguration = PlaybackPolicy &
  Readonly<{
    provider: "hls";
    manifestUrl: string;
    externalWatchUrl: string | null;
  }>;

export type ProviderConfiguration =
  | YouTubeProviderConfiguration
  | HlsProviderConfiguration;

export interface ProviderDefinition<
  TProvider extends LiveStreamProvider = LiveStreamProvider,
> {
  readonly id: TProvider;
  readonly capabilities: ProviderCapabilities;
}

export interface ProviderRegistry {
  readonly list: () => readonly ProviderDefinition[];
  readonly get: (provider: string) => ProviderDefinition;
  readonly validate: (
    input: ProviderConfigurationInput,
    policyOverride?: ProviderPolicyOverride,
  ) => ProviderConfiguration;
}
