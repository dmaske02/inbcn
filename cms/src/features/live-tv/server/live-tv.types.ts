import type { LiveStreamProvider } from "../providers/provider-types.ts";
import type { LiveStreamOperationalState } from "../providers/provider-policy.ts";

export type LiveStreamDto = Readonly<{
  id: string;
  languageId: string;
  internalName: string;
  title: string;
  description: string;
  provider: LiveStreamProvider;
  providerStreamId: string | null;
  streamUrl: string | null;
  externalWatchUrl: string | null;
  posterUrl: string | null;
  posterAltText: string | null;
  status: LiveStreamOperationalState;
  autoplay: boolean;
  muted: boolean;
  startsAt: string | null;
  endsAt: string | null;
  offlineMessage: string | null;
  relatedCategoryId: string | null;
  relatedStoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageUrl: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type LiveStreamViewModel = Readonly<
  Omit<LiveStreamDto, "createdBy" | "updatedBy">
>;

export type LiveStreamScheduleDto = Readonly<{
  id: string;
  status: LiveStreamOperationalState;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type LiveStreamScheduleWrite = Readonly<{
  status?: LiveStreamOperationalState;
  starts_at?: string | null;
  ends_at?: string | null;
}>;

