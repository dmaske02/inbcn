import { cva } from "class-variance-authority";
import { TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

const errorStateVariants = cva(
  "border border-[#e3ddd3] border-s-2 border-s-[#b3261e] bg-[#fcf1f0] p-6 text-foreground",
);

type ErrorStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  action?: ReactNode;
};

function ErrorState({
  className,
  title,
  description,
  action,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(errorStateVariants(), className)}
      {...props}
    >
      <TriangleAlert className="mb-3 size-5 text-destructive" aria-hidden="true" />
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

export { ErrorState, errorStateVariants };
