export type HlsPlaybackEngine = "hls.js" | "native" | "unsupported";

export function selectHlsPlaybackEngine(capabilities: Readonly<{
  hlsJsSupported: boolean;
  nativeSupported: boolean;
}>): HlsPlaybackEngine {
  if (capabilities.hlsJsSupported) return "hls.js";
  if (capabilities.nativeSupported) return "native";
  return "unsupported";
}
