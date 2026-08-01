import { cva, type VariantProps } from "class-variance-authority";
import Image from "next/image";
import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const logoVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);

const logoImageVariants = cva("w-auto max-w-none object-contain", {
  variants: {
    size: {
      sm: "h-[34px]",
      default: "h-[34px] sm:h-10 lg:h-11 xl:h-12",
      lg: "h-12",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

type LogoProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  VariantProps<typeof logoImageVariants> & {
    href?: string;
    imagePreload?: boolean;
  };

function Logo({
  className,
  size,
  href = "/",
  imagePreload = false,
  ...props
}: LogoProps) {
  return (
    <Link
      href={href}
      className={cn(logoVariants(), className)}
      aria-label="INBCN Digital News Homepage"
      {...props}
    >
      <Image
        src="/images/logo/inbcn-logo.png"
        alt="INBCN Digital News"
        width={1494}
        height={648}
        quality={100}
        sizes="(min-width: 1280px) 260px, (min-width: 768px) 220px, 180px"
        preload={imagePreload}
        className={logoImageVariants({ size })}
      />
    </Link>
  );
}

export { Logo, logoImageVariants, logoVariants };
