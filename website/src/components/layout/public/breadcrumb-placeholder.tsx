import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { Breadcrumb } from "@/components/common/breadcrumb";
import { cn } from "@/lib/utils";

const breadcrumbPlaceholderVariants = cva("py-4");

type BreadcrumbPlaceholderProps = ComponentProps<typeof Breadcrumb>;

function BreadcrumbPlaceholder({
  className,
  ...props
}: BreadcrumbPlaceholderProps) {
  return (
    <Breadcrumb
      className={cn(breadcrumbPlaceholderVariants(), className)}
      {...props}
    />
  );
}

export { BreadcrumbPlaceholder, breadcrumbPlaceholderVariants };
