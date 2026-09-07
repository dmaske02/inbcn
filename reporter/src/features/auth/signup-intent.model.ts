export type AuthMode = "signin" | "create";

export function parseAuthMode(value: unknown): AuthMode {
  return value === "create" ? "create" : "signin";
}

export function authDestination(
  _mode: AuthMode,
  state: "applicant" | "reporter",
): "/application" | "/stories" {
  return state === "applicant" ? "/application" : "/stories";
}
