import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { SearchTrigger as BaseSearchTrigger } from "@/components/common/search-trigger";
import { cn } from "@/lib/utils";

const searchTriggerVariants = cva("");

type SearchTriggerProps = ComponentProps<typeof BaseSearchTrigger>;

function SearchTrigger({ className, ...props }: SearchTriggerProps) {
  return (
    <BaseSearchTrigger
      className={cn(searchTriggerVariants(), className)}
      {...props}
    />
  );
}

export { SearchTrigger, searchTriggerVariants };
