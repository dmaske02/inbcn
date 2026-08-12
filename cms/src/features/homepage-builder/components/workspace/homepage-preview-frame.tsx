"use client";

import { useState } from "react";
import { Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  HomepageEditorEvent,
  HomepageEditorViewport,
} from "../../editor/homepage-editor.types";
import type { HomepageLocale } from "../../homepage-builder.types";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, label: "Desktop", icon: Monitor },
  tablet: { width: 768, height: 1024, label: "Tablet", icon: Tablet },
  mobile: { width: 390, height: 844, label: "Mobile", icon: Smartphone },
} as const;

export function HomepagePreviewFrame({
  locale,
  revision,
  viewport,
  dispatch,
}: Readonly<{
  locale: HomepageLocale;
  revision: number;
  viewport: HomepageEditorViewport;
  dispatch: React.Dispatch<HomepageEditorEvent>;
}>) {
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = `/homepage-builder-preview/${locale}?revision=${revision}&refresh=${refreshSequence}`;
  const preset = VIEWPORTS[viewport];
  const loadState = failedSrc === src ? "error" : loadedSrc === src ? "ready" : "loading";

  const announcement = loadState === "loading"
    ? "Refreshing homepage preview."
    : loadState === "ready"
      ? "Homepage preview refreshed."
      : "Homepage preview could not be loaded.";

  return (
    <section aria-labelledby="homepage-preview-heading" className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold" id="homepage-preview-heading">
            Homepage preview
          </h2>
          <p className="text-sm text-muted-foreground">
            Persisted, server-confirmed content for {locale.toUpperCase()}.
          </p>
        </div>
        <div aria-label="Preview viewport" className="flex flex-wrap gap-2" role="group">
          {(Object.keys(VIEWPORTS) as HomepageEditorViewport[]).map((mode) => {
            const option = VIEWPORTS[mode];
            const Icon = option.icon;
            return (
              <Button
                aria-label={`${option.label} preview, ${option.width} pixels wide`}
                aria-pressed={viewport === mode}
                key={mode}
                onClick={() => dispatch({ type: "viewport-changed", viewport: mode })}
                size="sm"
                type="button"
                variant={viewport === mode ? "default" : "outline"}
              >
                <Icon aria-hidden="true" />
                {option.label}
              </Button>
            );
          })}
          <Button
            aria-label="Refresh homepage preview"
            onClick={() => setRefreshSequence((current) => current + 1)}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" />
            Refresh Preview
          </Button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>

      <div className="max-w-full overflow-auto rounded-lg border border-border bg-muted/40 p-4">
        <div
          className="relative mx-auto shrink-0 overflow-hidden rounded-md border border-border bg-background shadow-sm transition-[width,height] motion-reduce:transition-none"
          style={{ height: preset.height, width: preset.width }}
        >
          {loadState === "loading" ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-10 grid place-items-center bg-background/90 text-sm text-muted-foreground"
            >
              Loading preview…
            </div>
          ) : null}
          {loadState === "error" ? (
            <div
              className="absolute inset-0 z-10 grid place-items-center bg-background p-6 text-center text-sm text-destructive"
              role="alert"
            >
              Homepage preview could not be loaded. Continue editing and try again after the next save.
            </div>
          ) : null}
          <iframe
            className="size-full border-0 bg-background"
            onError={() => setFailedSrc(src)}
            onLoad={() => {
              setFailedSrc(null);
              setLoadedSrc(src);
            }}
            sandbox="allow-same-origin allow-scripts"
            src={src}
            title="Homepage visual preview"
          />
        </div>
      </div>
    </section>
  );
}
