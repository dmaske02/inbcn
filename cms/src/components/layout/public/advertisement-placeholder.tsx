import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { AdvertisementPlaceholder } from "@/components/common/advertisement-placeholder";
import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

const publicAdvertisementVariants = cva("py-6 sm:py-8");

type PublicAdvertisementProps = ComponentProps<typeof AdvertisementPlaceholder> & {
  contained?: boolean;
};

function PublicAdvertisement({
  className,
  contained = true,
  ...props
}: PublicAdvertisementProps) {
  const advertisement = (
    <AdvertisementPlaceholder className={className} {...props} />
  );

  return (
    <div className={cn(publicAdvertisementVariants())}>
      {contained ? <Container>{advertisement}</Container> : advertisement}
    </div>
  );
}

export { PublicAdvertisement, publicAdvertisementVariants };
