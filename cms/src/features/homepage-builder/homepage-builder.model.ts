import type { AdminRole } from "@/features/admin/auth/authorization.model";

export class HomepageBuilderError extends Error {
  readonly code: "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "REFERENCE_MISSING" | "ORDERING";
  constructor(code: "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "REFERENCE_MISSING" | "ORDERING", message: string) { super(message); this.name = "HomepageBuilderError"; this.code = code; }
}

export function canManageHomepageBuilder(role: AdminRole) { return role === "editor" || role === "admin"; }
export function isSectionActive(section: { enabled: boolean; startsAt: string | null; endsAt: string | null }, now = new Date()) {
  if (!section.enabled) return false;
  const time = now.getTime();
  return (!section.startsAt || Date.parse(section.startsAt) <= time) && (!section.endsAt || Date.parse(section.endsAt) > time);
}
export function validatePositions(sections: readonly { position: number }[]) {
  const positions = sections.map((item) => item.position).toSorted((a, b) => a - b);
  if (positions.some((position, index) => position !== index)) throw new HomepageBuilderError("ORDERING", "Section positions must be unique and contiguous.");
}
