export const PROVIDER_ERROR_CODES = [
  "UNSUPPORTED_PROVIDER",
  "INVALID_PROVIDER_SOURCE",
  "HTTPS_REQUIRED",
  "HOST_NOT_ALLOWED",
  "AUTOPLAY_REQUIRES_MUTED",
  "INVALID_OPERATIONAL_STATE",
  "INVALID_SCHEDULE_TIMESTAMP",
  "SCHEDULE_START_REQUIRED",
  "SCHEDULE_START_NOT_FUTURE",
  "SCHEDULE_END_NOT_AFTER_START",
  "LIVE_START_IN_FUTURE",
  "LIVE_WINDOW_ENDED",
  "PROVIDER_UNAVAILABLE",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export type SafeProviderError = Readonly<{
  code: ProviderErrorCode;
  message: string;
  field: string | null;
  retryable: boolean;
}>;

export class LiveStreamProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly safeMessage: string;
  readonly field: string | null;
  readonly retryable: boolean;

  constructor({
    code,
    safeMessage,
    field = null,
    retryable = false,
    cause,
  }: Readonly<{
    code: ProviderErrorCode;
    safeMessage: string;
    field?: string | null;
    retryable?: boolean;
    cause?: unknown;
  }>) {
    super(safeMessage, { cause });
    this.name = "LiveStreamProviderError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.field = field;
    this.retryable = retryable;
  }

  toJSON(): SafeProviderError {
    return {
      code: this.code,
      message: this.safeMessage,
      field: this.field,
      retryable: this.retryable,
    };
  }
}

export function toSafeProviderError(error: unknown): SafeProviderError {
  if (error instanceof LiveStreamProviderError) return error.toJSON();
  return {
    code: "PROVIDER_UNAVAILABLE",
    message: "The stream provider is temporarily unavailable.",
    field: null,
    retryable: true,
  };
}
