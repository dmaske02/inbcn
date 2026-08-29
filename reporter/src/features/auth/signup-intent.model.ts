export type AuthMode = "signin" | "create";

export function parseAuthMode(value: unknown): AuthMode {
  return value === "create" ? "create" : "signin";
}

export function authDestination(
  mode: AuthMode,
  state: "applicant" | "reporter",
): "/application" | "/dashboard" {
  return mode === "create" && state === "applicant" ? "/application" : "/dashboard";
}
