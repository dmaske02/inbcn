export class ApplicationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationInputError";
  }
}

export function applicationInputErrorMessage(error: unknown): string | null {
  return error instanceof ApplicationInputError ? error.message : null;
}
