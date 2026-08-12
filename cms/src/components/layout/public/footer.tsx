import { cva } from "class-variance-authority";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";
import type { PublicLocale } from "./types";

const footerVariants = cva("mt-12 bg-[#14110f] py-8 text-[#b9b0a5] sm:py-10");

type FooterProps = HTMLAttributes<HTMLElement> & {
  locale: PublicLocale;
  navigation?: ReactNode;
  description?: ReactNode;
  copyright?: ReactNode;
  compliance?: ReactNode;
};

function Footer({ className, locale, navigation, description, copyright, compliance, ...props }: FooterProps) {
  return (
    <footer className={cn(footerVariants(), className)} {...props}>
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_3fr] lg:gap-12">
          <div>
            <Link href={`/${locale}`} className="font-heading text-[34px] font-bold leading-none tracking-[-0.04em] text-white">INBCN</Link>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-[#b9b0a5]">{description}</p>
          </div>
          {navigation}
        </div>
        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-[#2a2521] pt-5 text-[11.5px] text-[#7e7469]">
          <span>{copyright ?? `© ${new Date().getFullYear()} INBCN`}</span>
          <span>{compliance}</span>
        </div>
      </Container>
    </footer>
  );
}

export { Footer, footerVariants };
