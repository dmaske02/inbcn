import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-transparent px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        signal: "bg-signal text-signal-foreground hover:bg-signal/90",
        outline:
          "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "min-h-0 rounded-none px-0 text-foreground underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
      },
      size: {
        sm: "min-h-9 px-3 text-xs",
        default: "min-h-11 px-4",
        lg: "min-h-12 px-6 text-base",
        icon: "size-11 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
