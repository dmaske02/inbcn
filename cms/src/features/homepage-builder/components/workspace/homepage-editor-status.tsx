import type {
  HomepageEditorSaveState,
  HomepageEditorSaveStatus,
} from "../../editor/homepage-editor.types";

type StatusView = Readonly<{
  status: HomepageEditorSaveStatus;
  label: string;
}>;

const PRIORITY: readonly HomepageEditorSaveStatus[] = [
  "conflict",
  "error",
  "saving",
  "dirty",
  "saved",
  "idle",
];

function latestSavedAt(savedAtById: Readonly<Record<string, Date>>): Date | null {
  const values = Object.values(savedAtById);
  return values.length ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}

export function deriveHomepageEditorStatus(
  saveStates: readonly HomepageEditorSaveState[],
  savedAtById: Readonly<Record<string, Date>>,
): StatusView {
  const status = PRIORITY.find((candidate) => saveStates.some((item) => item.status === candidate)) ?? "idle";
  const savedAt = latestSavedAt(savedAtById);

  switch (status) {
    case "conflict":
      return { status, label: "Conflict — reload the section before saving again" };
    case "error":
      return { status, label: "Save failed" };
    case "saving":
      return { status, label: "Saving…" };
    case "dirty":
      return { status, label: "Unsaved changes" };
    case "saved":
      return {
        status,
        label: savedAt
          ? `Saved at ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(savedAt)}`
          : "Saved",
      };
    case "idle":
      return { status, label: "All changes saved" };
  }
}

export function HomepageEditorStatus({
  saveStates,
  savedAtById,
}: Readonly<{
  saveStates: readonly HomepageEditorSaveState[];
  savedAtById: Readonly<Record<string, Date>>;
}>) {
  const view = deriveHomepageEditorStatus(saveStates, savedAtById);
  const emphasis = view.status === "error" || view.status === "conflict"
    ? "text-destructive"
    : "text-muted-foreground";

  return (
    <p aria-live="polite" className={`text-sm font-medium ${emphasis}`} role="status">
      {view.label}
    </p>
  );
}
