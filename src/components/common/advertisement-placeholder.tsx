import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const advertisementVariants = cva(
  "grid w-full place-items-center border border-dashed border-muted-foreground/50 bg-muted/20 px-4 text-center text-xs tracking-wide text-muted-foreground",
  {
    variants: {
      size: {
        banner: "min-h-24",
        rectangle: "min-h-64",
        mobile: "min-h-28",
      },
    },
    defaultVariants: {
      size: "banner",
    },
  },
);

type AdvertisementPlaceholderProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof advertisementVariants> & {
    label?: string;
  };

function AdvertisementPlaceholder({
  className,
  size,
  label = "Advertisement",
  ...props
}: AdvertisementPlaceholderProps) {
  return (
    <aside
      aria-label={label}
      className={cn(advertisementVariants({ size }), className)}
      {...props}
    >
      {label}
    </aside>
  );
}

export { AdvertisementPlaceholder, advertisementVariants };
