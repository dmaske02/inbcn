import { LiveStreamProviderError } from "./provider-errors.ts";
import type {
  PlaybackPolicy,
  PlaybackPolicyInput,
  ProviderPolicy,
  ProviderPolicyOverride,
} from "./provider-types.ts";

export const LIVE_STREAM_OPERATIONAL_STATES = [
  "draft",
  "scheduled",
  "live",
  "offline",
  "archived",
] as const;

export type LiveStreamOperationalState =
  (typeof LIVE_STREAM_OPERATIONAL_STATES)[number];

export type LiveStreamScheduleInput = Readonly<{
  state: string;
  startsAt?: string | null;
  endsAt?: string | null;
}>;

export type LiveStreamSchedule = Readonly<{
  state: LiveStreamOperationalState;
  startsAt: string | null;
  endsAt: string | null;
}>;

export const DEFAULT_PROVIDER_POLICY: ProviderPolicy = Object.freeze({
  allowedHosts: Object.freeze({
    youtube: Object.freeze([
      "youtube.com",
      "www.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
    ]),
    hls: Object.freeze([]),
  }),
  autoplay: Object.freeze({ defaultEnabled: false, requiresMuted: true }),
  muted: Object.freeze({ defaultEnabled: true }),
});

export function resolveProviderPolicy(
  override: ProviderPolicyOverride = {},
): ProviderPolicy {
  return {
    allowedHosts: {
      youtube:
        override.allowedHosts?.youtube ??
        DEFAULT_PROVIDER_POLICY.allowedHosts.youtube,
      hls:
        override.allowedHosts?.hls ?? DEFAULT_PROVIDER_POLICY.allowedHosts.hls,
    },
    autoplay: {
      ...DEFAULT_PROVIDER_POLICY.autoplay,
      ...override.autoplay,
    },
    muted: { ...DEFAULT_PROVIDER_POLICY.muted, ...override.muted },
  };
}

export function applyPlaybackPolicy(
  input: PlaybackPolicyInput,
  policy: ProviderPolicy = DEFAULT_PROVIDER_POLICY,
): PlaybackPolicy {
  const autoplay = input.autoplay ?? policy.autoplay.defaultEnabled;
  const muted = input.muted ?? policy.muted.defaultEnabled;
  if (autoplay && policy.autoplay.requiresMuted && !muted) {
    throw new LiveStreamProviderError({
      code: "AUTOPLAY_REQUIRES_MUTED",
      safeMessage: "Autoplay is allowed only when the stream is muted.",
      field: "muted",
    });
  }
  return { autoplay, muted };
}

export function validateOperationalState(
  state: string,
): LiveStreamOperationalState {
  if (
    !LIVE_STREAM_OPERATIONAL_STATES.includes(
      state as LiveStreamOperationalState,
    )
  ) {
    throw new LiveStreamProviderError({
      code: "INVALID_OPERATIONAL_STATE",
      safeMessage: "The stream operational state is invalid.",
      field: "state",
    });
  }
  return state as LiveStreamOperationalState;
}

function normalizeTimestamp(
  value: string | null | undefined,
  field: "startsAt" | "endsAt",
): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new LiveStreamProviderError({
      code: "INVALID_SCHEDULE_TIMESTAMP",
      safeMessage: "The stream schedule contains an invalid timestamp.",
      field,
    });
  }
  return new Date(timestamp).toISOString();
}

export function validateSchedule(
  input: LiveStreamScheduleInput,
  now = new Date(),
): LiveStreamSchedule {
  const state = validateOperationalState(input.state);
  const startsAt = normalizeTimestamp(input.startsAt, "startsAt");
  const endsAt = normalizeTimestamp(input.endsAt, "endsAt");
  const nowTime = now.getTime();

  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new LiveStreamProviderError({
      code: "SCHEDULE_END_NOT_AFTER_START",
      safeMessage: "The stream end must be after its start.",
      field: "endsAt",
    });
  }

  if (state === "scheduled") {
    if (!startsAt) {
      throw new LiveStreamProviderError({
        code: "SCHEDULE_START_REQUIRED",
        safeMessage: "A scheduled stream requires a start time.",
        field: "startsAt",
      });
    }
    if (Date.parse(startsAt) <= nowTime) {
      throw new LiveStreamProviderError({
        code: "SCHEDULE_START_NOT_FUTURE",
        safeMessage: "A scheduled stream must start in the future.",
        field: "startsAt",
      });
    }
  }

  if (state === "live") {
    if (startsAt && Date.parse(startsAt) > nowTime) {
      throw new LiveStreamProviderError({
        code: "LIVE_START_IN_FUTURE",
        safeMessage: "A live stream cannot start in the future.",
        field: "startsAt",
      });
    }
    if (endsAt && Date.parse(endsAt) <= nowTime) {
      throw new LiveStreamProviderError({
        code: "LIVE_WINDOW_ENDED",
        safeMessage: "The live stream schedule has already ended.",
        field: "endsAt",
      });
    }
  }

  return { state, startsAt, endsAt };
}
