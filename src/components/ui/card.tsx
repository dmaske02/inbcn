import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const cardVariants = cva("bg-card text-card-foreground", {
  variants: {
    variant: {
      editorial: "border-t-2 border-foreground pt-4",
      bordered: "rounded-md border border-border",
      plain: "",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5 sm:p-6",
    },
  },
  defaultVariants: {
    variant: "bordered",
    padding: "none",
  },
});

type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

function Card({ className, variant, padding, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-2 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

export { Card, CardContent, CardFooter, CardHeader, cardVariants };
