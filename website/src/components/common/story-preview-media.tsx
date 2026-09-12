"use client";

import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import {
  activateStoryVideoPreview,
  resolveStoryPreviewSource,
  withVideoPreviewTime,
  type StoryPreviewImage,
  type StoryVideoPreview,
} from "./story-preview-media.model";

type StoryPreviewMediaProps = Readonly<{
  image?: StoryPreviewImage | null;
  videoPreview?: StoryVideoPreview | null;
  title: string;
  alt?: string;
  className?: string;
  href?: string;
  imageStyle?: CSSProperties;
  interactive?: boolean;
  priority?: boolean;
  sizes: string;
}>;

export function StoryPreviewMedia({
  image,
  videoPreview,
  title,
  alt = image?.alt ?? title,
  className,
  href,
  imageStyle,
  interactive = true,
  priority = false,
  sizes,
}: StoryPreviewMediaProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const source = resolveStoryPreviewSource(image, videoPreview);

  if (source.kind === "image") {
    const responsiveImage = (
    <Image
      src={source.image.src}
      alt={alt}
      className={cn("object-cover", className)}
      fill
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      unoptimized={source.image.unoptimized}
      sizes={sizes}
      style={imageStyle}
    />
    );
    return href ? (
      <Link
        aria-hidden={alt === "" ? "true" : undefined}
        className="block size-full"
        href={href}
        tabIndex={alt === "" ? -1 : undefined}
      >
        {responsiveImage}
      </Link>
    ) : responsiveImage;
  }

  if (isPlaying) {
    return (
      <video
        aria-label={`Video: ${title}`}
        autoPlay
        className={cn("block size-full object-cover", className)}
        controls
        playsInline
        poster={source.poster ?? undefined}
      >
        <source src={source.src} type={source.mimeType} />
        Your browser does not support video playback.
      </video>
    );
  }

  const preview = (
    <video
      aria-hidden="true"
      className={cn("block size-full object-cover", className)}
      muted
      playsInline
      poster={source.poster ?? undefined}
      preload="metadata"
      src={withVideoPreviewTime(source.src)}
      tabIndex={-1}
    />
  );

  if (!interactive) return preview;

  return (
    <button
      aria-label={`Play video: ${title}`}
      className="group/media relative block size-full cursor-pointer overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
      onClick={(event) => activateStoryVideoPreview(event, () => setIsPlaying(true))}
      type="button"
    >
      {preview}
      <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover/media:bg-black/20">
        <span className="grid size-14 place-items-center rounded-full bg-black/75 text-white shadow-lg transition-transform group-hover/media:scale-110 motion-reduce:transition-none sm:size-16">
          <Play aria-hidden="true" className="ml-1 size-7 fill-current sm:size-8" />
        </span>
      </span>
    </button>
  );
}

export type { StoryPreviewImage, StoryVideoPreview } from "./story-preview-media.model";
