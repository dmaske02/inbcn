import "server-only";

import { revalidatePath } from "next/cache";

export function revalidatePublicNews(): void {
  revalidatePath("/[locale]", "layout");
}
