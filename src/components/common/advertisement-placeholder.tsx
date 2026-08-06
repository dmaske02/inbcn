import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const advertisementVariants = cva(
  "grid w-full place-items-center border border-dashed border-[#d5ccbe] bg-[#fbf9f5] px-4 text-center text-[10px] uppercase tracking-[0.18em] text-[#a79c8e]",
  {
    variants: {
      size: {
        banner: "min-h-[90px]",
        rectangle: "min-h-[250px]",
        mobile: "min-h-[110px]",
        halfPage: "min-h-[600px]",
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
      <span>{label}<span className="ms-2 normal-case tracking-normal text-[#c3b9aa]" aria-hidden="true">reserved</span></span>
    </aside>
  );
}

export { AdvertisementPlaceholder, advertisementVariants };
