"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PublicLocale } from "./types";

export type SearchDialogLabels = Readonly<{
  open: string;
  close: string;
  title: string;
  description: string;
  placeholder: string;
  submit: string;
}>;

type SearchDialogProps = Readonly<{
  locale: PublicLocale;
  labels: SearchDialogLabels;
}>;

export function SearchDialog({ locale, labels }: SearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function openDialog() {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
  }

  function handleNativeClose() {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={labels.open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={openDialog}
        className="grid size-11 shrink-0 place-items-center text-[var(--editorial-fg)] transition-colors hover:text-[var(--editorial-accent)]"
      >
        <Search aria-hidden="true" className="size-[18px]" />
      </button>

      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={handleNativeClose}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        className="m-auto w-[min(680px,calc(100%-28px))] max-w-none border border-[var(--editorial-border)] bg-[var(--editorial-surface)] p-0 text-[var(--editorial-fg)] shadow-none backdrop:bg-[color-mix(in_oklch,var(--editorial-fg)_62%,transparent)] sm:w-[min(680px,calc(100%-48px))]"
      >
        <div className="border-t-2 border-t-[var(--editorial-accent)] p-5 sm:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="editorial-meta text-[10px] uppercase text-[var(--editorial-accent)]">
                INBCN DIGITAL DESK
              </p>
              <h2 id={titleId} className="editorial-headline mt-2 text-3xl font-semibold leading-tight">
                {labels.title}
              </h2>
              <p id={descriptionId} className="mt-2 max-w-[52ch] text-sm leading-6 text-[var(--editorial-muted)]">
                {labels.description}
              </p>
            </div>
            <button
              type="button"
              aria-label={labels.close}
              onClick={closeDialog}
              className="grid size-11 shrink-0 place-items-center border border-[var(--editorial-border)] hover:border-[var(--editorial-fg)]"
            >
              <X aria-hidden="true" className="size-[18px]" />
            </button>
          </div>

          <form action={`/${locale}/search`} method="get" role="search" className="mt-8 flex border-y border-[var(--editorial-border)] py-3">
            <label htmlFor={`${titleId}-query`} className="sr-only">
              {labels.title}
            </label>
            <Search aria-hidden="true" className="ms-1 mt-3 size-5 shrink-0 text-[var(--editorial-muted)]" />
            <input
              ref={inputRef}
              id={`${titleId}-query`}
              name="q"
              type="search"
              required
              maxLength={160}
              autoComplete="off"
              placeholder={labels.placeholder}
              className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-[var(--editorial-muted)]"
            />
            <button
              type="submit"
              className="min-h-11 shrink-0 bg-[var(--editorial-fg)] px-5 text-sm font-semibold text-[var(--editorial-surface)] hover:bg-[var(--editorial-accent)]"
            >
              {labels.submit}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
