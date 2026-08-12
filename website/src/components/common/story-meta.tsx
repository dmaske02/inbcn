import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Timestamp } from "./timestamp";

const storyMetaVariants = cva(
  "flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#8a7f73]",
  {
    variants: {
      density: {
        default: "",
        compact: "text-xs",
      },
    },
    defaultVariants: {
      density: "default",
    },
  },
);

type StoryMetaProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof storyMetaVariants> & {
    publishedAt: string | Date;
    displayTime?: string;
    locale?: string;
    author?: ReactNode;
    source?: ReactNode;
    readingTimeMinutes?: number;
  };

function StoryMeta({
  className,
  density,
  publishedAt,
  displayTime,
  locale,
  author,
  source,
  readingTimeMinutes,
  ...props
}: StoryMetaProps) {
  const items = [
    author,
    source,
    <Timestamp
      key="timestamp"
      value={publishedAt}
      locale={locale}
      display={displayTime}
      className="text-inherit"
    />,
    readingTimeMinutes ? `${readingTimeMinutes} min read` : null,
  ].filter(Boolean);

  return (
    <div className={cn(storyMetaVariants({ density }), className)} {...props}>
      {items.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

export { StoryMeta, storyMetaVariants };
