import type { AdminIdentity } from "@/features/admin/auth/authorization.model";

export async function validateFeaturedMediaChange(
  admin: AdminIdentity,
  requestedFeaturedMediaId: string | null,
  currentFeaturedMediaId: string | null,
  isSelectable: (admin: AdminIdentity, id: string) => Promise<boolean>,
): Promise<Readonly<{ ok: true } | { ok: false; code: "FORBIDDEN" | "UNAVAILABLE" }>> {
  if (admin.role === "writer") {
    return requestedFeaturedMediaId === currentFeaturedMediaId
      ? { ok: true }
      : { ok: false, code: "FORBIDDEN" };
  }
  if (requestedFeaturedMediaId && !(await isSelectable(admin, requestedFeaturedMediaId))) {
    return { ok: false, code: "UNAVAILABLE" };
  }
  return { ok: true };
}
