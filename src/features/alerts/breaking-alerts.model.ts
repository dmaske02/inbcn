import { z } from "zod";

export const ALERT_TYPES = ["breaking", "alert", "emergency"] as const;
export const ALERT_PLACEMENTS = ["breaking_ticker", "pinned_banner", "emergency_banner"] as const;
export const ALERT_STATUSES = ["draft", "active", "archived"] as const;
export const ALERT_SCOPES = ["global", "category", "story"] as const;

const optionalUuid = z.union([z.literal(""), z.uuid()]);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/u, "Use a six-digit HEX color.");

export const alertFormSchema = z.object({
  title: z.string().trim().min(1).max(180), message: z.string().trim().min(1).max(1000),
  type: z.enum(ALERT_TYPES), placement: z.enum(ALERT_PLACEMENTS), status: z.enum(ALERT_STATUSES),
  isActive: z.boolean(), priority: z.coerce.number().int().min(1).max(100),
  targetScope: z.enum(ALERT_SCOPES), languageId: z.uuid(), categoryId: optionalUuid,
  storyId: optionalUuid, backgroundColor: color, textColor: color, dismissible: z.boolean(),
  startAt: z.string().min(1), endAt: z.string(),
}).superRefine((value, context) => {
  if (value.targetScope === "category" && !value.categoryId) context.addIssue({ code: "custom", path: ["categoryId"], message: "Select a category." });
  if (value.targetScope === "story" && !value.storyId) context.addIssue({ code: "custom", path: ["storyId"], message: "Select a story." });
  if (value.endAt && new Date(value.endAt) <= new Date(value.startAt)) context.addIssue({ code: "custom", path: ["endAt"], message: "Expiry must be after the start time." });
});

export type AlertFormValues = z.infer<typeof alertFormSchema>;
export type AlertType = (typeof ALERT_TYPES)[number];
export type AlertPlacement = (typeof ALERT_PLACEMENTS)[number];

export type PublicAlert = Readonly<{
  id: string; title: string; message: string; type: AlertType; placement: AlertPlacement;
  status: string; isActive: boolean; priority: number; targetScope: string;
  languageCode: string; categorySlug: string | null; storySlug: string | null;
  backgroundColor: string; textColor: string; dismissible: boolean; startAt: string; endAt: string | null;
}>;

export function isAlertVisible(alert: PublicAlert, now = new Date()): boolean {
  return alert.status === "active" && alert.isActive && new Date(alert.startAt) <= now && (!alert.endAt || new Date(alert.endAt) > now);
}

const typeRank: Record<AlertType, number> = { emergency: 0, breaking: 1, alert: 2 };
export function orderAlerts<T extends Pick<PublicAlert, "type" | "priority">>(alerts: readonly T[]): T[] {
  return alerts.toSorted((a, b) => typeRank[a.type] - typeRank[b.type] || a.priority - b.priority);
}

export function alertMatchesPath(alert: PublicAlert, pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== alert.languageCode) return false;
  if (alert.targetScope === "global") return true;
  if (alert.targetScope === "category") return parts[1] === "category" && parts[2] === alert.categorySlug;
  if (alert.targetScope === "story") return parts[1] === "story" && parts[2] === alert.storySlug;
  return false;
}

export function getAlertPresentation(placement: AlertPlacement) {
  if (placement === "emergency_banner") return { role: "alert" as const, label: "Emergency", className: "emergency" as const };
  if (placement === "breaking_ticker") return { role: "status" as const, label: "Breaking", className: "breaking" as const };
  return { role: "status" as const, label: "Alert", className: "pinned" as const };
}

export function canManageAlerts(role: string): boolean { return role === "editor" || role === "admin"; }
export function canDeleteAlerts(role: string): boolean { return role === "admin"; }
