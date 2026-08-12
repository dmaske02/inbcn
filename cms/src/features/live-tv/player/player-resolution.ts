import { validateProviderConfiguration } from "../providers/provider-registry.ts";

export type PlayerInput = Readonly<{
  status: string;
  provider: string;
  providerStreamId: string | null;
  streamUrl: string | null;
  autoplay: boolean;
  muted: boolean;
  allowedHlsHosts: readonly string[];
}>;

export type ResolvedPlayer =
  | Readonly<{ kind: "youtube"; videoId: string; autoplay: boolean; muted: boolean }>
  | Readonly<{ kind: "hls"; manifestUrl: string; autoplay: boolean; muted: boolean }>
  | Readonly<{ kind: "offline" }>
  | Readonly<{ kind: "error"; code: "INVALID_PROVIDER" | "MISSING_SOURCE" | "INVALID_CONFIGURATION" }>;

export function resolvePlayer(input: PlayerInput): ResolvedPlayer {
  if (input.status !== "live") return { kind: "offline" };
  if (input.provider !== "youtube" && input.provider !== "hls") {
    return { kind: "error", code: "INVALID_PROVIDER" };
  }
  const source = input.provider === "youtube" ? input.providerStreamId : input.streamUrl;
  if (!source) return { kind: "error", code: "MISSING_SOURCE" };

  try {
    const configuration = validateProviderConfiguration(
      { provider: input.provider, source, autoplay: input.autoplay, muted: input.muted },
      { allowedHosts: { hls: input.allowedHlsHosts } },
    );
    return configuration.provider === "youtube"
      ? { kind: "youtube", videoId: configuration.videoId, autoplay: configuration.autoplay, muted: configuration.muted }
      : { kind: "hls", manifestUrl: configuration.manifestUrl, autoplay: configuration.autoplay, muted: configuration.muted };
  } catch {
    return { kind: "error", code: "INVALID_CONFIGURATION" };
  }
}
