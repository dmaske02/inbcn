import type { PublicAlert } from "./breaking-alerts.model.ts";

type Relation = Readonly<{ code?: string; slug?: string }> | readonly Readonly<{ code?: string; slug?: string }>[] | null;
function field(relation: Relation, key: "code" | "slug"): string | null {
  if (!relation) return null;
  const item = Array.isArray(relation)
    ? relation[0]
    : (relation as Readonly<{ code?: string; slug?: string }>);
  return item?.[key] ?? null;
}

export function mapPublicAlertRow(row: Readonly<{
  id: string; title: string; message: string; type: string; placement: string; status: string; is_active: boolean;
  priority: number; target_scope: string; background_color: string; text_color: string; dismissible: boolean;
  start_at: string; end_at: string | null; language: Relation; category: Relation; story: Relation;
}>): PublicAlert {
  return { id: row.id, title: row.title, message: row.message, type: row.type as PublicAlert["type"], placement: row.placement as PublicAlert["placement"], status: row.status, isActive: row.is_active, priority: row.priority, targetScope: row.target_scope, languageCode: field(row.language, "code") ?? "", categorySlug: field(row.category, "slug"), storySlug: field(row.story, "slug"), backgroundColor: row.background_color, textColor: row.text_color, dismissible: row.dismissible, startAt: row.start_at, endAt: row.end_at };
}
