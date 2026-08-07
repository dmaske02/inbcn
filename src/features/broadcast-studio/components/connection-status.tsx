import type {
  BroadcastNetworkStatus,
  BroadcastStudioStatus,
} from "../models/broadcast-session.model";

const statusLabels: Record<BroadcastStudioStatus, string> = {
  idle: "Idle",
  preview: "Preview ready",
  connecting: "Connecting",
  live: "Live",
  disconnected: "Disconnected",
  error: "Action required",
};

export function ConnectionStatus({
  status,
  networkStatus,
}: Readonly<{
  status: BroadcastStudioStatus;
  networkStatus: BroadcastNetworkStatus;
}>) {
  const networkLabel =
    networkStatus === "reconnecting" ? " — reconnecting to the network" : "";
  return (
    <p role="status" aria-live="polite" className="text-sm font-medium text-foreground">
      Status: {statusLabels[status]}{networkLabel}
    </p>
  );
}
