import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const logoVariants = cva(
  "inline-flex min-h-11 items-center gap-2 font-semibold tracking-[-0.04em] text-foreground",
  {
    variants: {
      size: {
        sm: "text-lg",
        default: "text-xl",
        lg: "text-2xl",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type LogoProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  VariantProps<typeof logoVariants> & {
    href?: string;
    label?: string;
  };

function Logo({
  className,
  size,
  href = "/",
  label = "INBCN",
  ...props
}: LogoProps) {
  return (
    <Link
      href={href}
      className={cn(logoVariants({ size }), className)}
      aria-label={`${label} home`}
      {...props}
    >
      <span className="size-2.5 bg-signal" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

export { Logo, logoVariants };
