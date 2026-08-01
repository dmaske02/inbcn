import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { SignalRail as BaseSignalRail } from "@/components/layout/signal-rail";
import { cn } from "@/lib/utils";

const signalRailVariants = cva("top-16");

type SignalRailProps = ComponentProps<typeof BaseSignalRail>;

function SignalRail({ className, ...props }: SignalRailProps) {
  return (
    <BaseSignalRail
      className={cn(signalRailVariants(), className)}
      {...props}
    />
  );
}

export { SignalRail, signalRailVariants };
