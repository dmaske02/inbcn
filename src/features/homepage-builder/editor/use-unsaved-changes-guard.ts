"use client";

import * as React from "react";
import type { HomepageEditorSaveStatus } from "./homepage-editor.types.ts";

type EventTargetLike = Readonly<{
  addEventListener(type: string, listener: (event: never) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: never) => void, options?: boolean | EventListenerOptions): void;
}>;

type InstallGuardOptions = Readonly<{
  active: boolean;
  windowTarget: EventTargetLike;
  documentTarget: EventTargetLike;
  confirm(message: string): boolean;
  message: string;
}>;

type BeforeUnloadLike = {
  returnValue: string | undefined;
  preventDefault(): void;
};

type ClickLike = {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: { closest?(selector: string): { href?: string; target?: string } | null } | null;
  preventDefault(): void;
  stopPropagation(): void;
};

export function shouldProtectHomepageNavigation(statuses: readonly HomepageEditorSaveStatus[]): boolean {
  return statuses.some((status) => status === "dirty" || status === "saving");
}

export function installUnsavedChangesGuard(options: InstallGuardOptions): () => void {
  if (!options.active) return () => {};

  const beforeUnload = (event: BeforeUnloadLike) => {
    event.preventDefault();
    event.returnValue = "";
  };
  const click = (event: ClickLike) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor?.href || anchor.target === "_blank") return;
    if (!options.confirm(options.message)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const unloadListener = beforeUnload as (event: never) => void;
  const clickListener = click as (event: never) => void;
  options.windowTarget.addEventListener("beforeunload", unloadListener);
  options.documentTarget.addEventListener("click", clickListener, true);

  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    options.windowTarget.removeEventListener("beforeunload", unloadListener);
    options.documentTarget.removeEventListener("click", clickListener, true);
  };
}

export function useUnsavedChangesGuard(statuses: readonly HomepageEditorSaveStatus[]) {
  const active = shouldProtectHomepageNavigation(statuses);
  const message = "You have unsaved Homepage Builder changes. Leave this page?";

  React.useEffect(() => installUnsavedChangesGuard({
    active,
    windowTarget: window as unknown as EventTargetLike,
    documentTarget: document as unknown as EventTargetLike,
    confirm: (prompt) => window.confirm(prompt),
    message,
  }), [active]);

  return React.useCallback(() => !active || window.confirm(message), [active]);
}

