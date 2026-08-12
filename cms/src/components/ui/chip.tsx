import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors",
  {
    variants: {
      selected: {
        true: "border-primary bg-primary text-primary-foreground",
        false: "border-border bg-background text-foreground hover:bg-accent",
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof chipVariants>;

function Chip({ className, selected, type = "button", ...props }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected ?? false}
      className={cn(chipVariants({ selected }), className)}
      {...props}
    />
  );
}

export { Chip, chipVariants };
