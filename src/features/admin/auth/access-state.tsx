import Link from "next/link";
import { CircleAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type AccessStateProps = Readonly<{
  code: "401" | "403";
  title: string;
  description: string;
}>;

export function AccessState({ code, title, description }: AccessStateProps) {
  return (
    <Card className="w-full max-w-lg shadow-sm" padding="none">
      <CardHeader className="items-start">
        <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden="true" />
        </span>
        <p className="pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {code}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="leading-7 text-muted-foreground">{description}</p>
        <div className="flex flex-wrap gap-3">
          <Link className={buttonVariants()} href="/admin/login">
            Return to sign in
          </Link>
          <Link className={buttonVariants({ variant: "outline" })} href="/en">
            Visit INBCN
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
