import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { StoryCard, type StoryCardProps } from "./story-card";

const featuredCardVariants = cva("h-full");

function FeaturedCard({ className, ...props }: Omit<StoryCardProps, "variant">) {
  return (
    <StoryCard
      variant="featured"
      className={cn(featuredCardVariants(), className)}
      {...props}
    />
  );
}

export { FeaturedCard, featuredCardVariants };
