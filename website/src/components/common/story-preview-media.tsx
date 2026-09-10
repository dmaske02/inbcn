import Image from "next/image";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

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

type StoryPreviewMediaProps = Readonly<{
  image: StoryPreviewImage;
  videoPreview?: StoryVideoPreview | null;
  alt?: string;
  className?: string;
  imageStyle?: CSSProperties;
  priority?: boolean;
  sizes: string;
}>;

export function StoryPreviewMedia({
  image,
  videoPreview,
  alt = image.alt,
  className,
  imageStyle,
  priority = false,
  sizes,
}: StoryPreviewMediaProps) {
  return videoPreview ? (
    <video
      aria-hidden={alt === "" ? "true" : undefined}
      aria-label={alt || undefined}
      className={cn("block size-full object-cover", className)}
      muted
      playsInline
      poster={videoPreview.poster ?? undefined}
      preload="metadata"
      tabIndex={-1}
    >
      <source src={videoPreview.src} type={videoPreview.mimeType} />
    </video>
  ) : (
    <Image
      src={image.src}
      alt={alt}
      className={cn("object-cover", className)}
      fill
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      unoptimized={image.unoptimized}
      sizes={sizes}
      style={imageStyle}
    />
  );
}
