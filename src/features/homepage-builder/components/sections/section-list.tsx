"use client";

import { useMemo, useState, type Dispatch } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Card, CardContent } from "@/components/ui/card";
import type {
  HomepageEditorDraft,
  HomepageEditorEvent,
  HomepageEditorSaveState,
} from "../../editor/homepage-editor.types";
import {
  deleteHomepageSection,
  duplicateHomepageSection,
  moveHomepageSectionTo,
} from "../../homepage-builder.actions";
import type { HomepageLocale, HomepageSectionDto } from "../../homepage-builder.types";
import { SortableSectionCard } from "./sortable-section-card";

function positionOf(ids: readonly string[], id: string | number): number {
  return ids.indexOf(String(id)) + 1;
}

export function SectionList({
  locale,
  orderedIds,
  draftsBySectionId,
  saveStateById,
  selectedSectionId,
  disabled,
  dispatch,
  sections,
  pendingDeleteId,
  canManage,
}: Readonly<{
  locale: HomepageLocale;
  orderedIds: readonly string[];
  draftsBySectionId: Readonly<Record<string, HomepageEditorDraft>>;
  saveStateById: Readonly<Record<string, HomepageEditorSaveState>>;
  selectedSectionId: string | null;
  disabled: boolean;
  dispatch: Dispatch<HomepageEditorEvent>;
  sections: readonly HomepageSectionDto[];
  pendingDeleteId: string | null;
  canManage: boolean;
}>) {
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labels = useMemo(
    () => Object.fromEntries(orderedIds.map((id) => [id, draftsBySectionId[id]?.title ?? "Section"])),
    [draftsBySectionId, orderedIds],
  );
  const announcements: Announcements = useMemo(() => ({
    onDragStart({ active }) {
      return `${labels[String(active.id)]} picked up at position ${positionOf(orderedIds, active.id)} of ${orderedIds.length}.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `${labels[String(active.id)]} is no longer over a valid position.`;
      return `${labels[String(active.id)]} is over position ${positionOf(orderedIds, over.id)} of ${orderedIds.length}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `${labels[String(active.id)]} was not moved.`;
      return `${labels[String(active.id)]} was dropped at position ${positionOf(orderedIds, over.id)} of ${orderedIds.length}.`;
    },
    onDragCancel({ active }) {
      return `Movement cancelled. ${labels[String(active.id)]} returned to its original position.`;
    },
  }), [labels, orderedIds]);

  function onDragStart(event: DragStartEvent) {
    setAnnouncement(`${labels[String(event.active.id)]} selected for movement.`);
  }

  function onDragOver() {
    // DndContext provides the position announcement while an item moves.
  }

  function onDragCancel() {
    setAnnouncement("Movement cancelled. The previous order was preserved.");
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const expectedOrder = [...orderedIds];
    const from = expectedOrder.indexOf(String(event.active.id));
    const targetPosition = expectedOrder.indexOf(String(event.over.id));
    if (from < 0 || targetPosition < 0) return;
    const optimisticOrder = arrayMove(expectedOrder, from, targetPosition);
    dispatch({ type: "reorder-optimistic", orderedIds: optimisticOrder });
    setPending(true);

    try {
      const result = await moveHomepageSectionTo({
        locale,
        sectionId: String(event.active.id),
        targetPosition,
        expectedOrder,
      });
      if (result.ok) {
        dispatch({ type: "reorder-succeeded", sections: result.data });
        setAnnouncement(`${labels[String(event.active.id)]} moved to position ${targetPosition + 1}.`);
      } else {
        dispatch({ type: "reorder-reverted" });
        setAnnouncement(`${result.message} The previous order was restored.`);
      }
    } catch {
      dispatch({ type: "reorder-reverted" });
      setAnnouncement("The section could not be moved. The previous order was restored.");
    } finally {
      setPending(false);
    }
  }

  async function duplicateSection(sectionId: string) {
    const source = sections.find((item) => item.id === sectionId);
    if (!source) return;
    const expectedOrder = [...orderedIds];
    const temporaryId = `optimistic-${crypto.randomUUID()}`;
    dispatch({ type: "duplicate-optimistic", sourceSectionId: sectionId, temporaryId });
    setPending(true);
    try {
      const result = await duplicateHomepageSection({
        locale,
        id: sectionId,
        expectedUpdatedAt: source.updatedAt,
        expectedOrder,
      });
      if (result.ok) {
        dispatch({
          type: "duplicate-succeeded",
          temporaryId,
          section: result.data.section,
          sections: result.data.sections,
        });
        setAnnouncement(`Section duplicated: ${result.data.section.title}.`);
      } else {
        dispatch({ type: "structural-reverted" });
        setAnnouncement(`${result.message} The duplicate was removed.`);
      }
    } catch {
      dispatch({ type: "structural-reverted" });
      setAnnouncement("The section could not be duplicated. The duplicate was removed.");
    } finally {
      setPending(false);
    }
  }

  async function deleteSection(sectionId: string) {
    const source = sections.find((item) => item.id === sectionId);
    if (!source) return;
    const expectedOrder = [...orderedIds];
    dispatch({ type: "delete-cancelled" });
    dispatch({ type: "delete-optimistic", sectionId });
    setPending(true);
    try {
      const result = await deleteHomepageSection({
        locale,
        id: sectionId,
        expectedUpdatedAt: source.updatedAt,
        expectedOrder,
      });
      if (result.ok) {
        dispatch({ type: "delete-succeeded", sectionId, sections: result.data.sections });
        setAnnouncement(`Section deleted: ${source.title}.`);
      } else {
        dispatch({ type: "structural-reverted" });
        setAnnouncement(`${result.message} The section was restored.`);
      }
    } catch {
      dispatch({ type: "structural-reverted" });
      setAnnouncement("The section could not be deleted. The section was restored.");
    } finally {
      setPending(false);
    }
  }

  function cancelDeletion() {
    dispatch({ type: "delete-cancelled" });
    setAnnouncement("Deletion cancelled.");
  }

  if (!orderedIds.length) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sections are configured for this locale.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <DndContext
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: "Press Space or Enter to pick up a section. Use the arrow keys to move it. Press Space or Enter to drop, or Escape to cancel.",
          },
        }}
        collisionDetection={closestCenter}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragStart={onDragStart}
        sensors={sensors}
      >
        <SortableContext items={[...orderedIds]} strategy={verticalListSortingStrategy}>
          <ul aria-label="Homepage sections" className="grid gap-2">
            {orderedIds.map((sectionId) => {
              const draft = draftsBySectionId[sectionId];
              if (!draft) return null;
              return (
                <SortableSectionCard
                  canManage={canManage}
                  deleteOpen={pendingDeleteId === sectionId}
                  disabled={disabled || pending}
                  draft={draft}
                  key={sectionId}
                  locale={locale}
                  onDeleteCancel={cancelDeletion}
                  onDeleteConfirm={() => void deleteSection(sectionId)}
                  onDeleteOpen={() => dispatch({ type: "delete-requested", sectionId })}
                  onDuplicate={() => void duplicateSection(sectionId)}
                  onSelect={() => dispatch({ type: "select", sectionId })}
                  saveState={saveStateById[sectionId]}
                  selected={selectedSectionId === sectionId}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <p aria-live="polite" className="sr-only" role="status">{announcement}</p>
    </>
  );
}
