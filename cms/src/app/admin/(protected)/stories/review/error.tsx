"use client";

import { Button } from "@/components/ui/button";

export default function StoryReviewError({ reset }: { reset: () => void }) {
  return <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6" role="alert"><h1 className="font-semibold">The review queue could not be loaded.</h1><p className="mt-2 text-sm text-muted-foreground">Check the connection and try again.</p><Button className="mt-4" onClick={reset} type="button">Try again</Button></div>;
}
