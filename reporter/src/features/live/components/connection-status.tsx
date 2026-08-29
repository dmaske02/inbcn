import type { BroadcastState } from "../client/broadcast-controller.ts";

const label: Record<BroadcastState["phase"], string> = {
  idle: "Ready", preview: "Preview ready", connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", ended: "Ended", error: "Action required",
};

const tone: Record<BroadcastState["phase"], string> = {
  idle: "border-border bg-muted text-foreground",
  preview: "border-border bg-muted text-foreground",
  connecting: "border-border bg-muted text-foreground",
  live: "border-verified/30 bg-verified/10 text-verified",
  reconnecting: "border-border bg-muted text-foreground",
  ended: "border-border bg-secondary text-secondary-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function ConnectionStatus({ phase }: Readonly<{ phase: BroadcastState["phase"] }>) {
  return <p aria-live="polite" className={`w-fit rounded-sm border px-2 py-1 text-xs font-semibold leading-none ${tone[phase]}`} role="status">Status: {label[phase]}</p>;
}
