import { cva, type VariantProps } from "class-variance-authority";
import { Newspaper } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

const emptyStateVariants = cva(
  "flex flex-col items-start border border-[#e3ddd3] bg-[#fbf9f5] p-6",
  {
    variants: {
      align: {
        start: "items-start text-start",
        center: "items-center text-center",
      },
    },
    defaultVariants: {
      align: "start",
    },
  },
);

type EmptyStateProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof emptyStateVariants> & {
    title: string;
    description?: string;
    action?: ReactNode;
  };

function EmptyState({
  className,
  align,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ align }), className)} {...props}>
      <Newspaper className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
      <Typography as="h2" variant="title">
        {title}
      </Typography>
      {description && (
        <Typography variant="body" className="mt-2 text-muted-foreground">
          {description}
        </Typography>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { EmptyState, emptyStateVariants };
