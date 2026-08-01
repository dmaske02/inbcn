"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { authorizeCurrentAdmin } from "./server";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginState = Readonly<{
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Readonly<{
    email?: string[];
    password?: string[];
  }>;
}>;

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      status: "error",
      message: "The email or password is incorrect.",
    };
  }

  const authorization = await authorizeCurrentAdmin();
  if (!authorization.ok) {
    await supabase.auth.signOut();

    switch (authorization.reason) {
      case "profile-inactive":
        redirect("/admin/profile-inactive");
      case "role-mismatch":
      case "profile-mismatch":
        redirect("/admin/role-mismatch");
      case "session-expired":
        redirect("/admin/session-expired");
      case "profile-missing":
      case "forbidden":
        redirect("/admin/forbidden");
      default:
        redirect("/admin/unauthorized");
    }
  }

  redirect("/admin/dashboard");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
