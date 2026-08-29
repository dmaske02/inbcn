import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & Readonly<{ shape?: "line" | "block" | "circle" }>;
const shapes = { line: "h-4 rounded-sm", block: "rounded-md", circle: "rounded-full" } as const;
export function Skeleton({ className = "", shape = "line", ...props }: SkeletonProps) { return <div aria-hidden="true" className={`animate-pulse bg-muted motion-reduce:animate-none ${shapes[shape]} ${className}`} {...props} />; }
