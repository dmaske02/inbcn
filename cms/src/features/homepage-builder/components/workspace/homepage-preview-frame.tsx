"use client";

import { useEffect, useRef, useState } from "react";
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
  selectedSectionId,
}: Readonly<{
  locale: HomepageLocale;
  revision: number;
  viewport: HomepageEditorViewport;
  dispatch: React.Dispatch<HomepageEditorEvent>;
  selectedSectionId: string | null;
}>) {
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const src = `/homepage-builder-preview/${locale}?revision=${revision}&refresh=${refreshSequence}&selected=${selectedSectionId ?? ""}`;
  const preset = VIEWPORTS[viewport];
  const loadState = failedSrc === src ? "error" : loadedSrc === src ? "ready" : "loading";

  useEffect(() => {
    const previewViewport = previewViewportRef.current;
    if (!previewViewport) return;
    const observedViewport = previewViewport;

    function fitPreview() {
      const styles = window.getComputedStyle(observedViewport);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const availableWidth = Math.max(0, observedViewport.clientWidth - horizontalPadding);
      setFitScale(Math.min(1, availableWidth / preset.width));
    }

    fitPreview();
    const resizeObserver = new ResizeObserver(fitPreview);
    resizeObserver.observe(observedViewport);
    return () => resizeObserver.disconnect();
  }, [preset.width]);

  const announcement = loadState === "loading"
    ? "Refreshing homepage preview."
    : loadState === "ready"
      ? "Homepage preview refreshed."
      : "Homepage preview could not be loaded.";

  return (
    <section aria-labelledby="homepage-preview-heading" className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold" id="homepage-preview-heading">
            Homepage Canvas
          </h2>
          <p className="text-sm text-muted-foreground">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-600 align-middle" aria-hidden="true" />
            Server confirmed · {locale.toUpperCase()}
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

      <div
        className="max-w-full overflow-auto border border-border bg-[#ddd9d0] p-3 sm:p-5"
        ref={previewViewportRef}
      >
        <div
          className="relative mx-auto shrink-0 transition-[width,height] motion-reduce:transition-none"
          style={{ height: preset.height * fitScale, width: preset.width * fitScale }}
        >
          <div
            className="absolute left-0 top-0 overflow-hidden border border-border bg-background shadow-sm"
            style={{
              height: preset.height,
              transform: `scale(${fitScale})`,
              transformOrigin: "top left",
              width: preset.width,
            }}
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
      </div>
    </section>
  );
}
