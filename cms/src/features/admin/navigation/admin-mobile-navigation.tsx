"use client";

import { Menu, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

type AdminMobileNavigationProps = Readonly<{
  children: ReactNode;
}>;

export function AdminMobileNavigation({
  children,
}: AdminMobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeNavigation = () => setOpen(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNavigation();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  const keepFocusInDrawer = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;

    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="lg:hidden">
      <Button
        ref={triggerRef}
        aria-controls={drawerId}
        aria-expanded={open}
        aria-label="Open editorial navigation"
        onClick={() => setOpen(true)}
        size="icon"
        variant="outline"
      >
        <Menu aria-hidden="true" />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            onClick={closeNavigation}
            tabIndex={-1}
            type="button"
          />
          <aside
            aria-label="Editorial navigation"
            aria-modal="true"
            className="absolute inset-y-0 end-0 flex h-dvh max-h-dvh w-[min(22rem,calc(100vw-1rem))] max-w-full flex-col overflow-y-auto overscroll-contain border-s border-border bg-background ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl"
            id={drawerId}
            onKeyDown={keepFocusInDrawer}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <p className="text-sm font-semibold">Editorial navigation</p>
              <Button
                ref={closeRef}
                aria-label="Close editorial navigation"
                onClick={closeNavigation}
                size="icon"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <nav
              aria-label="Mobile editorial navigation"
              className="flex min-w-0 flex-1 flex-col py-4 [&_a]:flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center"
              onClick={closeNavigation}
            >
              {children}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
