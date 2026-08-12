import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Typography } from "@/components/ui/typography";

const sectionVariants = cva("scroll-mt-32", {
  variants: {
    spacing: {
      none: "",
      sm: "py-6 sm:py-8",
      default: "py-10 sm:py-12 lg:py-16",
      lg: "py-12 sm:py-16 lg:py-20",
    },
  },
  defaultVariants: {
    spacing: "default",
  },
});

type SectionProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof sectionVariants> & {
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
  };

function Section({
  className,
  spacing,
  title,
  description,
  action,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(sectionVariants({ spacing }), className)}
      {...props}
    >
      {(title || description || action) && (
        <header className="mb-6 border-t-2 border-foreground pt-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {title && (
                <Typography as="h2" variant="title">
                  {title}
                </Typography>
              )}
              {description && (
                <Typography className="mt-2" variant="meta">
                  {description}
                </Typography>
              )}
            </div>
            {action}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export { Section, sectionVariants };
