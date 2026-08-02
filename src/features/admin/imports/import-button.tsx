"use client";

import { useActionState } from "react";
import { Download, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  runNewsDataImportAction,
  type IngestionActionState,
} from "./ingestion.actions";

const initialState: IngestionActionState = { status: "idle" };

export function ImportButton({ sourceId }: Readonly<{ sourceId: string }>) {
  const [state, action, pending] = useActionState(
    runNewsDataImportAction.bind(null, sourceId),
    initialState,
  );

  return (
    <form action={action} className="space-y-2">
      <Button disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {pending ? "Importing…" : "Import now"}
      </Button>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "max-w-sm text-xs text-destructive"
              : "max-w-sm text-xs text-verified"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
