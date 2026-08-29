"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import { ReporterNavigation } from "./reporter-navigation";

type ReporterMobileNavigationProps = Readonly<{ reporterAccess: boolean }>;
const MenuIcon = () => <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" /></svg>;
const CloseIcon = () => <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" /></svg>;

export function ReporterMobileNavigation({ reporterAccess }: ReporterMobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeNavigation(); };
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
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const first = focusable.item(0);
    const last = focusable.item(focusable.length - 1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return (
    <div className="relative z-50 shrink-0 lg:hidden">
      <Button ref={triggerRef} aria-controls={drawerId} aria-expanded={open} aria-label="Open Reporter navigation" className="size-11" onClick={() => setOpen(true)} size="icon" variant="outline"><MenuIcon /></Button>
      {open ? <div className="fixed inset-0 z-[100] lg:hidden">
        <button aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={closeNavigation} tabIndex={-1} type="button" />
        <aside aria-label="Reporter navigation" aria-modal="true" className="absolute inset-y-0 end-0 flex h-dvh max-h-dvh w-[min(22rem,calc(100vw-1rem))] max-w-full flex-col overflow-y-auto overscroll-contain border-s border-border bg-background ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl" id={drawerId} onKeyDown={keepFocusInDrawer} role="dialog">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <div><p className="text-sm font-semibold">INBCN Reporter</p><p className="text-xs text-muted-foreground">{reporterAccess ? "Reporter workspace" : "Applicant workspace"}</p></div>
            <Button ref={closeRef} aria-label="Close Reporter navigation" onClick={closeNavigation} size="icon" variant="ghost"><CloseIcon /></Button>
          </div>
          <ReporterNavigation className="flex min-w-0 flex-1 flex-col py-4 [&_a]:min-h-11 [&_a]:w-full" onNavigate={closeNavigation} reporterAccess={reporterAccess} />
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Authenticated workspace</p>
            <form action={logoutAction}>
              <Button aria-label="Log out of Reporter" className="w-full" type="submit" variant="outline">Log out</Button>
            </form>
          </div>
        </aside>
      </div> : null}
    </div>
  );
}
