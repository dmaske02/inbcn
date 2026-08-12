import type { BroadcastStudioError } from "../models/broadcast-session.model";

export function PermissionBanner({
  error,
  alertRef,
}: Readonly<{
  error: BroadcastStudioError | null;
  alertRef?: React.Ref<HTMLDivElement>;
}>) {
  if (!error) return null;
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
    >
      {error.message}
    </div>
  );
}
