import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { StoryCard, type StoryCardProps } from "./story-card";

const horizontalCardVariants = cva("border-b border-border py-4 first:pt-0");

function HorizontalCard({
  className,
  ...props
}: Omit<StoryCardProps, "variant">) {
  return (
    <StoryCard
      variant="horizontal"
      className={cn(horizontalCardVariants(), className)}
      {...props}
    />
  );
}

export { HorizontalCard, horizontalCardVariants };
