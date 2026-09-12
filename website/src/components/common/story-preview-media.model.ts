export const STORY_PREVIEW_FALLBACK_IMAGE = "/images/news/story-fallback.svg";

export type StoryPreviewImage = Readonly<{
  src: string;
  alt: string;
  unoptimized?: boolean;
}>;

export type StoryVideoPreview = Readonly<{
  src: string;
  mimeType: string;
  poster: string | null;
}>;

export type StoryPreviewSource =
  | Readonly<{ kind: "image"; image: StoryPreviewImage }>
  | Readonly<{
      kind: "video";
      src: string;
      mimeType: string;
      poster: string | null;
    }>;

const VIDEO_MIME_TYPES: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};

function videoMimeType(url: string): string | null {
  const pathname = url.split(/[?#]/u, 1)[0]?.toLocaleLowerCase("en") ?? "";
  const extension = pathname.match(/[.]([a-z0-9]+)$/u)?.[1];
  return extension ? VIDEO_MIME_TYPES[extension] ?? null : null;
}

export function resolveStoryPreviewSource(
  image: StoryPreviewImage | null | undefined,
  videoPreview: StoryVideoPreview | null | undefined,
): StoryPreviewSource {
  if (videoPreview?.src.trim()) {
    return {
      kind: "video",
      src: videoPreview.src.trim(),
      mimeType: videoPreview.mimeType.trim() || "video/mp4",
      poster: videoPreview.poster,
    };
  }

  if (image?.src.trim()) {
    const mimeType = videoMimeType(image.src);
    if (mimeType) {
      return {
        kind: "video",
        src: image.src.trim(),
        mimeType,
        poster: null,
      };
    }
    return { kind: "image", image };
  }

  return {
    kind: "image",
    image: {
      src: STORY_PREVIEW_FALLBACK_IMAGE,
      alt: "",
      unoptimized: false,
    },
  };
}

export function withVideoPreviewTime(source: string): string {
  return `${source.split("#", 1)[0]}#t=0.001`;
}

export function activateStoryVideoPreview(
  event: Readonly<{
    preventDefault: () => void;
    stopPropagation: () => void;
  }>,
  activate: () => void,
) {
  event.preventDefault();
  event.stopPropagation();
  activate();
}
