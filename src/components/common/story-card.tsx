import { cva, type VariantProps } from "class-variance-authority";
import Image from "next/image";
import Link from "next/link";
import type { HTMLAttributes } from "react";

import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { CategoryBadge } from "./category-badge";
import { StoryMeta } from "./story-meta";

type StoryImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

type StoryCardContent = {
  title: string;
  href: string;
  summary?: string;
  category?: string;
  publishedAt: string | Date;
  displayTime?: string;
  image?: StoryImage;
  source?: string;
  author?: string;
  readingTimeMinutes?: number;
  locale?: string;
};

const storyCardVariants = cva("group min-w-0", {
  variants: {
    variant: {
      standard: "space-y-3",
      hero:
        "grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-8",
      featured: "space-y-4",
      horizontal:
        "grid grid-cols-[minmax(0,1fr)_minmax(7rem,.42fr)] items-start gap-4",
      compact: "border-b border-border py-4 first:pt-0",
    },
  },
  defaultVariants: {
    variant: "standard",
  },
});

const storyTitleVariants = cva(
  "font-heading font-semibold tracking-tight text-balance decoration-1 underline-offset-4 group-hover:underline",
  {
    variants: {
      variant: {
        standard: "text-xl leading-tight sm:text-2xl",
        hero: "text-3xl leading-[1.12] sm:text-4xl lg:text-5xl",
        featured: "text-2xl leading-tight sm:text-3xl",
        horizontal: "text-lg leading-snug sm:text-xl",
        compact: "text-base leading-snug sm:text-lg",
      },
    },
    defaultVariants: {
      variant: "standard",
    },
  },
);

const imageOrder = {
  standard: "order-first",
  hero: "order-first lg:order-last",
  featured: "order-first",
  horizontal: "order-last",
  compact: "hidden",
} as const;

type StoryCardProps = Omit<HTMLAttributes<HTMLElement>, "title"> &
  StoryCardContent &
  VariantProps<typeof storyCardVariants> & {
    priority?: boolean;
  };

function StoryCard({
  className,
  variant = "standard",
  title,
  href,
  summary,
  category,
  publishedAt,
  displayTime,
  image,
  source,
  author,
  readingTimeMinutes,
  locale,
  priority = false,
  ...props
}: StoryCardProps) {
  const content = (
    <div className="min-w-0 space-y-3">
      {category && <CategoryBadge>{category}</CategoryBadge>}
      <Link href={href} className="block">
        <h3 className={storyTitleVariants({ variant })}>{title}</h3>
      </Link>
      {summary && variant !== "compact" && (
        <Typography
          variant={variant === "hero" ? "lead" : "body"}
          className="text-muted-foreground"
        >
          {summary}
        </Typography>
      )}
      <StoryMeta
        density={variant === "compact" ? "compact" : "default"}
        publishedAt={publishedAt}
        displayTime={displayTime}
        locale={locale}
        source={source}
        author={author}
        readingTimeMinutes={readingTimeMinutes}
      />
    </div>
  );

  const media = image ? (
    <Link
      href={href}
      tabIndex={-1}
      aria-hidden="true"
      className={cn(
        "relative block aspect-video overflow-hidden bg-muted",
        imageOrder[variant ?? "standard"],
      )}
    >
      <Image
        src={image.src}
        alt=""
        width={image.width ?? 960}
        height={image.height ?? 540}
        priority={priority}
        sizes={
          variant === "hero"
            ? "(min-width: 1024px) 48vw, 100vw"
            : variant === "horizontal"
              ? "(min-width: 768px) 240px, 38vw"
              : "(min-width: 1024px) 30vw, 100vw"
        }
        className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.01] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span className="sr-only">{image.alt}</span>
    </Link>
  ) : null;

  return (
    <article
      className={cn(storyCardVariants({ variant }), className)}
      {...props}
    >
      {variant === "hero" ? (
        <>
          {content}
          {media}
        </>
      ) : variant === "horizontal" ? (
        <>
          {content}
          {media}
        </>
      ) : (
        <>
          {media}
          {content}
        </>
      )}
    </article>
  );
}

export { StoryCard, storyCardVariants, storyTitleVariants };
export type { StoryCardContent, StoryCardProps, StoryImage };
