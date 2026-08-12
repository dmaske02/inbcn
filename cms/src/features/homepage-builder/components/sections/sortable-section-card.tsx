"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  HomepageEditorDraft,
  HomepageEditorSaveState,
} from "../../editor/homepage-editor.types";
import { DeleteSectionDialog } from "./delete-section-dialog";
import { DuplicateSectionButton } from "./duplicate-section-button";

export function SortableSectionCard({
  draft,
  saveState,
  selected,
  disabled,
  onSelect,
  locale,
  deleteOpen,
  onDeleteOpen,
  onDeleteCancel,
  onDeleteConfirm,
  onDuplicate,
  canManage,
}: Readonly<{
  draft: HomepageEditorDraft;
  saveState: HomepageEditorSaveState | undefined;
  selected: boolean;
  disabled: boolean;
  onSelect(): void;
  locale: string;
  deleteOpen: boolean;
  onDeleteOpen(): void;
  onDeleteCancel(): void;
  onDeleteConfirm(): void;
  onDuplicate(): void;
  canManage: boolean;
}>) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: draft.id, disabled });
  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <Card className={isDragging ? "relative z-10 shadow-lg" : undefined}>
        <div className="flex min-h-16 items-stretch gap-2 p-2">
          {canManage ? (
            <button
              aria-label={`Move ${draft.title}`}
              className="touch-none rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
              disabled={disabled}
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" />
            </button>
          ) : null}
          <Button
            aria-pressed={selected}
            className="h-auto min-h-12 min-w-0 flex-1 justify-between px-3 py-2 text-left"
            onClick={onSelect}
            variant={selected ? "default" : "ghost"}
          >
            <span className="min-w-0">
              <span className="block truncate">{draft.title}</span>
              <span className="block text-xs opacity-75">{draft.blockType}</span>
            </span>
            {saveState?.status === "dirty" || saveState?.status === "saving" ? (
              <span className="text-xs">{saveState.status === "saving" ? "Saving" : "Changed"}</span>
            ) : null}
          </Button>
          {canManage ? (
            <div className="flex items-center">
              <DuplicateSectionButton
                disabled={disabled}
                onDuplicate={onDuplicate}
                title={draft.title}
              />
              <DeleteSectionDialog
                disabled={disabled}
                locale={locale}
                onCancel={onDeleteCancel}
                onConfirm={onDeleteConfirm}
                onOpen={onDeleteOpen}
                open={deleteOpen}
                title={draft.title}
              />
            </div>
          ) : null}
        </div>
      </Card>
    </li>
  );
}
