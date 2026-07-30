import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { StoryCard, type StoryCardProps } from "./story-card";

const heroCardVariants = cva("border-b border-border pb-6 lg:border-b-0 lg:pb-0");

function HeroCard({ className, ...props }: Omit<StoryCardProps, "variant">) {
  return (
    <StoryCard
      variant="hero"
      className={cn(heroCardVariants(), className)}
      {...props}
    />
  );
}

export { HeroCard, heroCardVariants };
