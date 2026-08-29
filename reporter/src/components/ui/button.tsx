import type { ComponentPropsWithRef } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "destructive" | "ghost";
type ButtonSize = "sm" | "default" | "lg" | "icon";
type ButtonProps = ComponentPropsWithRef<"button"> & Readonly<{ variant?: ButtonVariant; size?: ButtonSize }>;
const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border-border bg-background text-foreground hover:bg-accent",
  destructive: "border-transparent bg-destructive text-white hover:bg-destructive/90",
  ghost: "border-transparent text-foreground hover:bg-accent",
};
const sizes: Record<ButtonSize, string> = { sm: "min-h-9 px-3 text-xs", default: "min-h-11 px-4", lg: "min-h-12 px-6 text-base", icon: "size-11 px-0" };

export function Button({ className = "", variant = "primary", size = "default", type = "button", ...props }: ButtonProps) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} type={type} {...props} />;
}
export type { ButtonProps };
