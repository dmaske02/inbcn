"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MediaLibraryError({ retry }: Readonly<{ error: Error & { digest?: string }; retry: () => void }>) {
  return <Card><CardContent className="flex min-h-72 flex-col items-center justify-center text-center"><AlertTriangle aria-hidden="true" className="size-8 text-destructive" /><h1 className="mt-4 text-xl font-semibold">Unable to load media</h1><p className="mt-2 max-w-md text-sm text-muted-foreground">The library could not be loaded. Try again without leaving this page.</p><Button className="mt-5" onClick={retry} variant="outline"><RefreshCw aria-hidden="true" />Try again</Button></CardContent></Card>;
}
