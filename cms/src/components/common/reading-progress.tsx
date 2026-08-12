"use client";

import { cva } from "class-variance-authority";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const readingProgressVariants = cva(
  "fixed inset-x-0 top-0 z-[60] h-1 origin-left bg-signal motion-reduce:transition-none",
);

type ReadingProgressProps = {
  className?: string;
  label?: string;
};

function ReadingProgress({
  className,
  label = "Reading progress",
}: ReadingProgressProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function update() {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className={cn(readingProgressVariants(), className)}
      style={{ transform: `scaleX(${progress})` }}
    />
  );
}

export { ReadingProgress, readingProgressVariants };
