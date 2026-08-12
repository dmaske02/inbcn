"use client";

import { cva } from "class-variance-authority";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const themeToggleVariants = cva("");

type ThemeToggleProps = {
  className?: string;
  lightLabel?: string;
  darkLabel?: string;
};

function ThemeToggle({
  className,
  lightLabel = "Use light theme",
  darkLabel = "Use dark theme",
}: ThemeToggleProps) {
  const dark = useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggleTheme() {
    const nextDark = !dark;
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("theme", nextDark ? "dark" : "light");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(themeToggleVariants(), className)}
      aria-label={dark ? lightLabel : darkLabel}
      aria-pressed={dark}
      onClick={toggleTheme}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

export { ThemeToggle, themeToggleVariants };
