import type { LocalVideoTrack } from "livekit-client";

export async function attachPreviewTrack(
  track: Pick<LocalVideoTrack, "attach">,
  element: HTMLVideoElement,
) {
  track.attach(element);
  await element.play();
}
