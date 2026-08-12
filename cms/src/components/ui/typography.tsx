import { cva, type VariantProps } from "class-variance-authority";
import type { ElementType, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

const typographyVariants = cva("text-pretty text-foreground", {
  variants: {
    variant: {
      display:
        "font-heading text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-6xl",
      headline:
        "font-heading text-3xl leading-[1.12] font-semibold tracking-tight sm:text-4xl",
      title:
        "font-heading text-2xl leading-tight font-semibold tracking-tight sm:text-3xl",
      subtitle: "text-lg leading-relaxed text-muted-foreground sm:text-xl",
      body: "text-base leading-relaxed",
      lead: "text-lg leading-relaxed sm:text-xl",
      meta: "text-sm leading-normal text-muted-foreground",
      caption: "text-xs leading-normal text-muted-foreground",
      label:
        "text-xs leading-none font-semibold tracking-[0.12em] uppercase",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

type TypographyProps<T extends ElementType = "p"> = {
  as?: T;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "children"> &
  VariantProps<typeof typographyVariants>;

function Typography<T extends ElementType = "p">({
  as,
  className,
  variant,
  ...props
}: TypographyProps<T>) {
  const Component = as ?? "p";

  return (
    <Component
      className={cn(typographyVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Typography, typographyVariants };
