import { Button } from "@/components/ui/button";
import type { BroadcastStudioStatus } from "../models/broadcast-session.model";

export function BroadcastControls({
  status,
  hasPreview,
  disabled,
  onPreview,
  onStart,
  onStop,
}: Readonly<{
  status: BroadcastStudioStatus;
  hasPreview: boolean;
  disabled: boolean;
  onPreview(): void;
  onStart(): void;
  onStop(): void;
}>) {
  const active = status === "live" || status === "connecting";
  return (
    <div className="flex flex-wrap gap-3">
      {!hasPreview ? (
        <Button onClick={onPreview} disabled={disabled || active}>
          Start Preview
        </Button>
      ) : null}
      {hasPreview && !active ? (
        <Button variant="signal" onClick={onStart} disabled={disabled}>
          Start Broadcast
        </Button>
      ) : null}
      {active ? (
        <Button variant="destructive" onClick={onStop}>
          End Broadcast
        </Button>
      ) : null}
    </div>
  );
}
