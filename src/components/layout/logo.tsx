import { cva, type VariantProps } from "class-variance-authority";
import Image from "next/image";
import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const logoVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      size: {
        sm: "w-[78px]",
        default: "w-full",
        lg: "w-[111px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const logoImageVariants = cva(
  "h-auto w-full max-w-none shrink-0 object-contain",
);

type LogoProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  VariantProps<typeof logoVariants> & {
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
      className={cn(logoVariants({ size }), className)}
      aria-label="INBCN Digital News Homepage"
      {...props}
    >
      <Image
        src="/images/logo/inbcn-logo.png"
        alt="INBCN Digital News"
        width={1494}
        height={648}
        quality={100}
        sizes="(min-width: 1280px) 260px, (min-width: 1024px) 148px, (min-width: 640px) 129px, 101px"
        preload={imagePreload}
        className={logoImageVariants()}
      />
    </Link>
  );
}

export { Logo, logoImageVariants, logoVariants };
