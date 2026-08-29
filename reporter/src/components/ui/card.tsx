import type { HTMLAttributes } from "react";

const classes = (base: string, extra?: string) => `${base} ${extra ?? ""}`;
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={classes("rounded-md border border-border bg-card text-card-foreground", className)} {...props} />; }
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={classes("space-y-2 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />; }
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={classes("p-5 sm:p-6", className)} {...props} />; }
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={classes("flex items-center gap-3 p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />; }
