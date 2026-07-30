import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { StoryCard, type StoryCardProps } from "./story-card";

const compactCardVariants = cva("");

function CompactCard({ className, ...props }: Omit<StoryCardProps, "variant">) {
  return (
    <StoryCard
      variant="compact"
      className={cn(compactCardVariants(), className)}
      {...props}
    />
  );
}

export { CompactCard, compactCardVariants };
