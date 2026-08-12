"use client";

import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { ThemeToggle as BaseThemeToggle } from "@/components/common/theme-toggle";
import { cn } from "@/lib/utils";

const themeToggleVariants = cva("");

type ThemeToggleProps = ComponentProps<typeof BaseThemeToggle>;

function ThemeToggle({ className, ...props }: ThemeToggleProps) {
  return (
    <BaseThemeToggle
      className={cn(themeToggleVariants(), className)}
      {...props}
    />
  );
}

export { ThemeToggle, themeToggleVariants };
