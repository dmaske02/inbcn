import "server-only";

export type RepositoryErrorCode = "QUERY_FAILED";

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  readonly operation: string;

  constructor(operation: string) {
    super(`Unable to ${operation}.`);
    this.name = "RepositoryError";
    this.code = "QUERY_FAILED";
    this.operation = operation;
  }
}

export function assertRepositoryQuerySucceeded(
  error: unknown,
  operation: string,
): asserts error is null {
  if (error) {
    throw new RepositoryError(operation);
  }
}
