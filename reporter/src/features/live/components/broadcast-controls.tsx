import type { BroadcastState } from "../client/broadcast-controller.ts";

const button = "min-h-11 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-60";

export function BroadcastControls({ phase, hasPreview, acknowledged, onPreview, onStart, onLeave }: Readonly<{
  phase: BroadcastState["phase"];
  hasPreview: boolean;
  acknowledged: boolean;
  onPreview(): void;
  onStart(): void;
  onLeave(): void;
}>) {
  if (phase === "live" || phase === "reconnecting" || phase === "connecting") return <button aria-label="End live broadcast" className={`${button} bg-destructive text-destructive-foreground`} onClick={onLeave} type="button">End broadcast</button>;
  return <div className="flex flex-wrap gap-3">
    {!hasPreview ? <button aria-label="Start camera preview" className={`${button} bg-muted`} onClick={onPreview} type="button">Start preview</button> : null}
    {hasPreview ? <button aria-label="Start live broadcast" className={`${button} bg-foreground text-background`} disabled={!acknowledged} onClick={onStart} type="button">Start broadcast</button> : null}
  </div>;
}
