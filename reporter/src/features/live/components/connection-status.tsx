import type { BroadcastState } from "../client/broadcast-controller.ts";

const label: Record<BroadcastState["phase"], string> = {
  idle: "Ready", preview: "Preview ready", connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", ended: "Ended", error: "Action required",
};

export function ConnectionStatus({ phase }: Readonly<{ phase: BroadcastState["phase"] }>) {
  return <p aria-live="polite" className="text-sm font-medium" role="status">Status: {label[phase]}</p>;
}
