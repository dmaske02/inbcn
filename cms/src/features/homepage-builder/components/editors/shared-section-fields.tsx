"use client";

import type { HomepageEditorDraft, HomepageEditorFieldErrors } from "../../editor/homepage-editor.types.ts";

type SharedSectionFieldsProps<T extends HomepageEditorDraft> = Readonly<{
  draft: T;
  fieldErrors: HomepageEditorFieldErrors;
  onChange(draft: T): void;
}>;

const inputClassName = "min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  return message ? <span className="text-xs text-destructive" id={id}>{message}</span> : null;
}

export function SharedSectionFields<T extends HomepageEditorDraft>({ draft, fieldErrors, onChange }: SharedSectionFieldsProps<T>) {
  function update<Key extends "title" | "container" | "width" | "enabled" | "startsAt" | "endsAt">(
    key: Key,
    value: T[Key],
  ) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">Section settings</legend>
      <label className="grid gap-2 text-sm font-medium">
        Section title
        <input
          aria-describedby={fieldErrors.title ? `${draft.id}-title-error` : undefined}
          aria-invalid={Boolean(fieldErrors.title)}
          className={inputClassName}
          maxLength={180}
          onChange={(event) => update("title", event.target.value)}
          value={draft.title}
        />
        <FieldError id={`${draft.id}-title-error`} message={fieldErrors.title} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Container
          <select className={inputClassName} onChange={(event) => update("container", event.target.value as T["container"])} value={draft.container}>
            <option value="main">Main</option>
            <option value="sidebar">Sidebar</option>
            <option value="footer">Footer</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Width
          <select className={inputClassName} onChange={(event) => update("width", event.target.value as T["width"])} value={draft.width}>
            <option value="full">Full width</option>
            <option value="half">Half width</option>
            <option value="third">One third</option>
            <option value="quarter">One quarter</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Starts at
          <input
            aria-describedby={fieldErrors.startsAt ? `${draft.id}-starts-error` : undefined}
            aria-invalid={Boolean(fieldErrors.startsAt)}
            className={inputClassName}
            onChange={(event) => update("startsAt", event.target.value || null)}
            type="datetime-local"
            value={draft.startsAt?.slice(0, 16) ?? ""}
          />
          <FieldError id={`${draft.id}-starts-error`} message={fieldErrors.startsAt} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Ends at
          <input
            aria-describedby={fieldErrors.endsAt ? `${draft.id}-ends-error` : undefined}
            aria-invalid={Boolean(fieldErrors.endsAt)}
            className={inputClassName}
            onChange={(event) => update("endsAt", event.target.value || null)}
            type="datetime-local"
            value={draft.endsAt?.slice(0, 16) ?? ""}
          />
          <FieldError id={`${draft.id}-ends-error`} message={fieldErrors.endsAt} />
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm font-medium">
        <input checked={draft.enabled} className="size-4 accent-primary" onChange={(event) => update("enabled", event.target.checked)} type="checkbox" />
        Enabled on the homepage
      </label>
    </fieldset>
  );
}

