import { cva } from "class-variance-authority";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const searchTriggerVariants = cva("");

type SearchTriggerProps = Omit<ComponentProps<typeof Button>, "children"> & {
  label?: string;
  showLabel?: boolean;
};

function SearchTrigger({
  className,
  label = "Search",
  showLabel = false,
  ...props
}: SearchTriggerProps) {
  return (
    <Button
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      aria-label={showLabel ? undefined : label}
      className={cn(searchTriggerVariants(), className)}
      {...props}
    >
      <Search aria-hidden="true" />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </Button>
  );
}

export { SearchTrigger, searchTriggerVariants };
