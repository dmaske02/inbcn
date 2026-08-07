"use client";

import { useEffect, useState } from "react";

import { formatBroadcastDuration } from "../models/broadcast-session.model";

export function StreamTimer({ startedAt }: Readonly<{ startedAt: number | null }>) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <p aria-label="Broadcast duration" className="font-mono text-sm tabular-nums text-foreground">
      {formatBroadcastDuration(startedAt, now)}
    </p>
  );
}
