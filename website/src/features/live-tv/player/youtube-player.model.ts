export function buildYouTubeEmbedUrl(
  videoId: string,
  policy: Readonly<{ autoplay: boolean; muted: boolean }>,
): string {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId)) {
    throw new Error("The YouTube video identifier is invalid.");
  }
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  url.searchParams.set("autoplay", policy.autoplay ? "1" : "0");
  url.searchParams.set("mute", policy.muted ? "1" : "0");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("controls", "1");
  url.searchParams.set("rel", "0");
  return url.toString();
}
