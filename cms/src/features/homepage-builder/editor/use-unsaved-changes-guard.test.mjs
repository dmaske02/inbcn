import assert from "node:assert/strict";
import test from "node:test";
import { installUnsavedChangesGuard, shouldProtectHomepageNavigation } from "./use-unsaved-changes-guard.ts";

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.(event); },
    count() { return listeners.size; },
  };
}

test("navigation protection is active only for dirty or saving sections", () => {
  assert.equal(shouldProtectHomepageNavigation([]), false);
  assert.equal(shouldProtectHomepageNavigation(["saved", "idle"]), false);
  assert.equal(shouldProtectHomepageNavigation(["dirty"]), true);
  assert.equal(shouldProtectHomepageNavigation(["saving"]), true);
});

test("active guard protects refresh and blocks an unconfirmed locale or route link", () => {
  const windowTarget = target();
  const documentTarget = target();
  const cleanup = installUnsavedChangesGuard({
    active: true,
    windowTarget,
    documentTarget,
    confirm: () => false,
    message: "Unsaved changes",
  });
  const unload = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
  windowTarget.dispatch("beforeunload", unload);
  assert.equal(unload.prevented, true);
  assert.equal(unload.returnValue, "");

  const click = {
    prevented: false,
    stopped: false,
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => ({ href: "http://localhost:3000/admin/homepage-builder?locale=hi", target: "" }) },
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  documentTarget.dispatch("click", click);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  cleanup();
  assert.equal(windowTarget.count(), 0);
  assert.equal(documentTarget.count(), 0);
});

test("clean and confirmed navigation remain unblocked and cleanup is idempotent", () => {
  const windowTarget = target();
  const documentTarget = target();
  const clean = installUnsavedChangesGuard({ active: false, windowTarget, documentTarget, confirm: () => false, message: "" });
  assert.equal(windowTarget.count(), 0);
  assert.equal(documentTarget.count(), 0);
  clean();

  const cleanup = installUnsavedChangesGuard({ active: true, windowTarget, documentTarget, confirm: () => true, message: "Unsaved" });
  const click = {
    prevented: false, button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    target: { closest: () => ({ href: "http://localhost:3000/admin/dashboard", target: "" }) },
    preventDefault() { this.prevented = true; }, stopPropagation() {},
  };
  documentTarget.dispatch("click", click);
  assert.equal(click.prevented, false);
  cleanup();
  cleanup();
  assert.equal(windowTarget.count(), 0);
  assert.equal(documentTarget.count(), 0);
});

