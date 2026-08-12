import {
  LiveStreamProviderError,
} from "./provider-errors.ts";
import {
  DEFAULT_PROVIDER_POLICY,
  applyPlaybackPolicy,
  resolveProviderPolicy,
} from "./provider-policy.ts";
import {
  SUPPORTED_LIVE_STREAM_PROVIDERS,
  type HlsProviderConfiguration,
  type LiveStreamProvider,
  type ProviderConfiguration,
  type ProviderConfigurationInput,
  type ProviderDefinition,
  type ProviderPolicy,
  type ProviderPolicyOverride,
  type ProviderRegistry,
  type YouTubeProviderConfiguration,
} from "./provider-types.ts";

export { SUPPORTED_LIVE_STREAM_PROVIDERS } from "./provider-types.ts";

const providerDefinitions = Object.freeze({
  youtube: Object.freeze({
    id: "youtube",
    capabilities: Object.freeze({
      delivery: "iframe",
      nativeControls: true,
      captions: true,
      pictureInPicture: true,
      externalFallback: true,
      requiresRuntime: false,
    }),
  }),
  hls: Object.freeze({
    id: "hls",
    capabilities: Object.freeze({
      delivery: "media",
      nativeControls: true,
      captions: true,
      pictureInPicture: true,
      externalFallback: true,
      requiresRuntime: true,
    }),
  }),
} satisfies Record<LiveStreamProvider, ProviderDefinition>);

export function listProviderDefinitions(): readonly ProviderDefinition[] {
  return SUPPORTED_LIVE_STREAM_PROVIDERS.map(
    (provider) => providerDefinitions[provider],
  );
}

export function getProviderDefinition(provider: string): ProviderDefinition {
  if (!SUPPORTED_LIVE_STREAM_PROVIDERS.includes(provider as LiveStreamProvider)) {
    throw new LiveStreamProviderError({
      code: "UNSUPPORTED_PROVIDER",
      safeMessage: "This stream provider is not supported.",
      field: "provider",
    });
  }
  return providerDefinitions[provider as LiveStreamProvider];
}

function parseHttpsUrl(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new LiveStreamProviderError({
      code: "INVALID_PROVIDER_SOURCE",
      safeMessage: "The provider source is invalid.",
      field,
      cause,
    });
  }
  if (url.protocol !== "https:") {
    throw new LiveStreamProviderError({
      code: "HTTPS_REQUIRED",
      safeMessage: "Stream provider URLs must use HTTPS.",
      field,
    });
  }
  return url;
}

function assertAllowedHost(
  url: URL,
  hosts: readonly string[],
  field: string,
): void {
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (!hosts.some((host) => host.toLocaleLowerCase("en") === hostname)) {
    throw new LiveStreamProviderError({
      code: "HOST_NOT_ALLOWED",
      safeMessage: "The stream host is not approved.",
      field,
    });
  }
}

function validateExternalWatchUrl(
  value: string | null | undefined,
  hosts: readonly string[],
): string | null {
  if (!value) return null;
  const url = parseHttpsUrl(value, "externalWatchUrl");
  assertAllowedHost(url, hosts, "externalWatchUrl");
  return url.toString();
}

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/u;

function youtubeVideoId(source: string, policy: ProviderPolicy): string {
  const trimmed = source.trim();
  if (youtubeVideoIdPattern.test(trimmed)) return trimmed;

  const url = parseHttpsUrl(trimmed, "source");
  assertAllowedHost(url, policy.allowedHosts.youtube, "source");
  const host = url.hostname.toLocaleLowerCase("en");
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate =
    host === "youtu.be"
      ? parts[0]
      : url.searchParams.get("v") ??
        (["embed", "live", "shorts"].includes(parts[0] ?? "")
          ? parts[1]
          : null);
  if (!candidate || !youtubeVideoIdPattern.test(candidate)) {
    throw new LiveStreamProviderError({
      code: "INVALID_PROVIDER_SOURCE",
      safeMessage: "The YouTube stream identifier is invalid.",
      field: "source",
    });
  }
  return candidate;
}

function validateYouTube(
  input: Extract<ProviderConfigurationInput, { provider: "youtube" }>,
  policy: ProviderPolicy,
): YouTubeProviderConfiguration {
  return {
    provider: "youtube",
    videoId: youtubeVideoId(input.source, policy),
    externalWatchUrl: validateExternalWatchUrl(
      input.externalWatchUrl,
      policy.allowedHosts.youtube,
    ),
    ...applyPlaybackPolicy(input, policy),
  };
}

function validateHls(
  input: Extract<ProviderConfigurationInput, { provider: "hls" }>,
  policy: ProviderPolicy,
): HlsProviderConfiguration {
  const url = parseHttpsUrl(input.source, "source");
  assertAllowedHost(url, policy.allowedHosts.hls, "source");
  if (!url.pathname.toLocaleLowerCase("en").endsWith(".m3u8")) {
    throw new LiveStreamProviderError({
      code: "INVALID_PROVIDER_SOURCE",
      safeMessage: "The HLS source must reference an m3u8 manifest.",
      field: "source",
    });
  }
  return {
    provider: "hls",
    manifestUrl: url.toString(),
    externalWatchUrl: validateExternalWatchUrl(
      input.externalWatchUrl,
      policy.allowedHosts.hls,
    ),
    ...applyPlaybackPolicy(input, policy),
  };
}

export function validateProviderConfiguration(
  input: ProviderConfigurationInput,
  policyOverride: ProviderPolicyOverride = DEFAULT_PROVIDER_POLICY,
): ProviderConfiguration {
  getProviderDefinition(input.provider);
  const policy = resolveProviderPolicy(policyOverride);
  return input.provider === "youtube"
    ? validateYouTube(input, policy)
    : validateHls(input, policy);
}

export const providerRegistry: ProviderRegistry = Object.freeze({
  list: listProviderDefinitions,
  get: getProviderDefinition,
  validate: validateProviderConfiguration,
});
