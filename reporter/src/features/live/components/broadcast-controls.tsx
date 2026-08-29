import type { BroadcastState } from "../client/broadcast-controller.ts";

import { Button } from "@/components/ui/button";

export function BroadcastControls({ phase, hasPreview, acknowledged, onPreview, onStart, onLeave }: Readonly<{
  phase: BroadcastState["phase"];
  hasPreview: boolean;
  acknowledged: boolean;
  onPreview(): void;
  onStart(): void;
  onLeave(): void;
}>) {
  if (phase === "live" || phase === "reconnecting" || phase === "connecting") return <Button aria-label="End live broadcast" className="w-full sm:w-auto" onClick={onLeave} type="button" variant="destructive">End broadcast</Button>;
  return <div className="flex flex-col gap-3 sm:flex-row">
    {!hasPreview ? <Button aria-label="Start camera preview" className="w-full sm:w-auto" onClick={onPreview} type="button" variant="outline">Start preview</Button> : null}
    {hasPreview ? <Button aria-label="Start live broadcast" className="w-full sm:w-auto" disabled={!acknowledged} onClick={onStart} type="button">Start broadcast</Button> : null}
  </div>;
}
