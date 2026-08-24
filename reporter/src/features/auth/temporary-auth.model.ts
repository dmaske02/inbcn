import { validateIndianPhone } from "./authorization.model.ts";

type TemporaryAuthDependencies = Readonly<{
  findUser: (phone: string) => Promise<string | null>;
  createUser: (input: Readonly<{ phone: string; password: string }>) => Promise<string>;
  rotatePassword: (userId: string, password: string) => Promise<void>;
  ensureProfile: (userId: string) => Promise<void>;
  signIn: (input: Readonly<{ phone: string; password: string }>) => Promise<void>;
  randomPassword: () => string;
}>;

export class TemporaryAuthError extends Error {
  readonly code: "disabled" | "invalid-credentials" | "unavailable";

  constructor(code: "disabled" | "invalid-credentials" | "unavailable") {
    super(code);
    this.code = code;
  }
}

export function createTemporaryAuthService(dependencies: TemporaryAuthDependencies) {
  return {
    async signIn(input: Readonly<{ phone: unknown; code: unknown }>): Promise<void> {
      if (!validateIndianPhone(input.phone) || input.code !== "1234") {
        throw new TemporaryAuthError("invalid-credentials");
      }

      const password = dependencies.randomPassword();
      try {
        const existingUserId = await dependencies.findUser(input.phone);
        const userId = existingUserId
          ?? await dependencies.createUser({ phone: input.phone, password });
        if (existingUserId) await dependencies.rotatePassword(userId, password);
        await dependencies.ensureProfile(userId);
        await dependencies.signIn({ phone: input.phone, password });
      } catch (error) {
        if (error instanceof TemporaryAuthError) throw error;
        throw new TemporaryAuthError("unavailable");
      }
    },
  };
}
