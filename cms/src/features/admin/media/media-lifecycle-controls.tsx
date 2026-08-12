"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { restoreMediaAction, retireMediaAction } from "./media.actions";
import type { MediaLibraryItemView } from "./media.service";

export function MediaLifecycleControls({ item }: Readonly<{ item: MediaLibraryItemView }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function run(kind: "retire" | "restore") {
    if (kind === "retire" && !window.confirm("Retire this image? It will be hidden from the active library and media selection. The stored file and library record will be preserved.")) return;
    startTransition(async () => {
      const operation = kind === "retire" ? retireMediaAction : restoreMediaAction;
      const result = await operation({ id: item.id, expectedUpdatedAt: item.updatedAt });
      setMessage(result.message);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-5">
      {item.isRetired ? (
        <><p className="text-sm text-muted-foreground">Retired by an authorized editor {item.deletedAt ? `on ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.deletedAt))}` : ""}. The stored file is preserved.</p><Button className="focus-visible:ring-2" disabled={pending} onClick={() => run("restore")} type="button" variant="outline">{pending ? "Restoring…" : "Restore image"}</Button></>
      ) : item.usages.length ? (
        <><p className="text-sm text-muted-foreground">Cannot retire this image while it is used by a Story.</p><Button disabled type="button" variant="outline">Retire image</Button></>
      ) : (
        <><p className="text-sm text-muted-foreground">Not currently used by a Story</p><Button className="focus-visible:ring-2" disabled={pending} onClick={() => run("retire")} type="button" variant="outline">{pending ? "Retiring…" : "Retire image"}</Button></>
      )}
      <p aria-live="polite" className="text-sm text-muted-foreground" role="status">{message}</p>
    </div>
  );
}
