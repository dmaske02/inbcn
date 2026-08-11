"use client";

import { useMemo, useRef, useState, type ComponentType } from "react";
import { Plus } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import type {
  HomepageEditorDraft,
  HomepageEditorFieldErrors,
} from "../../editor/homepage-editor.types";
import {
  draftFromSection,
  validateHomepageEditorDraft,
} from "../../editor/homepage-editor.validation";
import { createVisualHomepageSection } from "../../homepage-builder.actions";
import {
  getHomepageBlockDefinition,
  HOMEPAGE_BLOCK_REGISTRY,
} from "../../homepage-builder.registry";
import type { HomepageLocale, HomepageSectionDto } from "../../homepage-builder.types";
import {
  getVisualBlockEditor,
  type BlockEditorProps,
} from "../editors/block-editor-registry";

function createDraft(blockType: string): HomepageEditorDraft {
  const definition = getHomepageBlockDefinition(blockType) ?? HOMEPAGE_BLOCK_REGISTRY[0];
  return draftFromSection({
    id: "new-section",
    homepageConfigurationId: "new-configuration",
    blockId: "new-section",
    title: definition.type,
    blockType: definition.id,
    renderer: definition.renderer,
    position: 0,
    container: "main",
    width: "full",
    enabled: true,
    startsAt: null,
    endsAt: null,
    configuration: definition.defaults,
    createdBy: null,
    updatedBy: null,
    createdAt: "",
    updatedAt: "",
  });
}

function visualValues(draft: HomepageEditorDraft) {
  return Object.fromEntries(
    Object.entries(draft).filter(([key]) => key !== "id" && key !== "blockId"),
  );
}

export function AddHomepageSectionDialog({
  locale,
  draft,
  onDraftChange,
  onStart,
  onCancel,
  onCreated,
}: Readonly<{
  locale: HomepageLocale;
  draft: HomepageEditorDraft | null;
  onDraftChange(draft: HomepageEditorDraft): void;
  onStart(draft: HomepageEditorDraft): void;
  onCancel(): void;
  onCreated(section: HomepageSectionDto): void;
}>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<HomepageEditorFieldErrors>({});
  const [message, setMessage] = useState("");
  const definition = draft ? getHomepageBlockDefinition(draft.blockType) : null;
  const clientErrors = useMemo(
    () => draft && definition ? validateHomepageEditorDraft(draft, definition) : {},
    [definition, draft],
  );
  const fieldErrors = { ...clientErrors, ...serverErrors };
  const visualEditor = draft ? getVisualBlockEditor(draft.blockType) : null;
  const Editor = visualEditor?.component as ComponentType<BlockEditorProps> | undefined;

  function resetMessages() {
    setServerErrors({});
    setMessage("");
  }

  function changeBlockType(blockType: string) {
    resetMessages();
    onDraftChange(createDraft(blockType));
  }

  function changeDraft(nextDraft: HomepageEditorDraft) {
    resetMessages();
    onDraftChange(nextDraft);
  }

  async function createSection() {
    if (!draft || !definition || Object.keys(clientErrors).length > 0) return;
    setSubmitting(true);
    resetMessages();
    try {
      const result = await createVisualHomepageSection({
        locale,
        section: visualValues(draft),
      });
      if (result.ok) {
        onCreated(result.data);
        setMessage(`Section added: ${result.data.title}.`);
        return;
      }
      setServerErrors(result.fieldErrors ?? {});
      setMessage(result.message);
    } catch {
      setMessage("The section could not be added. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogPrimitive.Root
      onOpenChange={(open) => {
        if (open) {
          resetMessages();
          onStart(createDraft(HOMEPAGE_BLOCK_REGISTRY[0].id));
        } else if (draft) {
          onCancel();
        }
      }}
      open={draft !== null}
    >
      <DialogPrimitive.Trigger asChild>
        <Button ref={triggerRef} type="button">
          <Plus aria-hidden="true" />
          Add section
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="text-xl font-semibold">Add homepage section</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            Choose a section type, complete its visual settings, then add it to the {locale.toUpperCase()} homepage.
          </DialogPrimitive.Description>

          {draft ? (
            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm font-medium">
                Section type
                <select
                  className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => changeBlockType(event.target.value)}
                  value={draft.blockType}
                >
                  {HOMEPAGE_BLOCK_REGISTRY.map((item) => (
                    <option key={item.id} value={item.id}>{item.type}</option>
                  ))}
                </select>
              </label>

              {Editor ? (
                <Editor
                  draft={draft}
                  fieldErrors={fieldErrors}
                  locale={locale}
                  onChange={changeDraft}
                />
              ) : (
                <p className="text-sm text-destructive" role="alert">This section type is not supported.</p>
              )}

              {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
              <div className="flex flex-wrap justify-end gap-3">
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogPrimitive.Close>
                <Button
                  disabled={submitting || Object.keys(clientErrors).length > 0}
                  onClick={() => void createSection()}
                  type="button"
                >
                  {submitting ? "Adding..." : "Add section"}
                </Button>
              </div>
            </div>
          ) : null}
          <p aria-live="polite" className="sr-only" role="status">{message}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
