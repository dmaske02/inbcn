"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/features/admin/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePublicNews } from "@/features/admin/public-revalidation";

export async function setEditorsPickAction(form: FormData): Promise<void> {
  const admin = await requireAdminUser();
  if (admin.role !== "editor" && admin.role !== "admin") redirect("/admin/forbidden");
  const parsed = z.object({ id: z.uuid(), selected: z.enum(["true", "false"]), expectedUpdatedAt: z.iso.datetime({ offset: true }) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/stories?error=invalid-placement");
  const { id, selected, expectedUpdatedAt } = parsed.data;
  const { data, error } = await (await createClient()).rpc("set_story_editors_pick", {
    p_story_id: id, p_selected: selected === "true", p_expected_updated_at: expectedUpdatedAt,
  });
  const result = z.object({ code: z.string() }).safeParse(data);
  if (error || !result.success || result.data.code !== "SUCCESS") {
    redirect(`/admin/stories/${id}?error=${result.success && result.data.code === "CONFLICT" ? "conflict" : "placement"}`);
  }
  revalidatePath(`/admin/stories/${id}`);
  revalidatePath("/admin/stories");
  revalidatePath("/admin/homepage-builder");
  await revalidatePublicNews();
  redirect(`/admin/stories/${id}?changed=placement`);
}
