import type { Database } from "../../../lib/supabase/types.ts";
import { validateSchedule } from "../../live-tv/providers/provider-policy.ts";
import {
  canManageLiveTv,
  canRemoveLiveTv,
  liveTvFormSchema,
  parseLiveTvProviderConfiguration,
  type LiveTvFormInput,
  type ManagedLiveTvIdentity,
} from "./live-tv.model.ts";

type Insert = Database["public"]["Tables"]["live_streams"]["Insert"];
type Update = Database["public"]["Tables"]["live_streams"]["Update"];

export type LiveTvWriteRepository = Readonly<{
  create(value: Insert): Promise<unknown>;
  update(id: string, value: Update): Promise<unknown>;
  remove(id: string): Promise<void>;
}>;

export class LiveTvManagementError extends Error {
  readonly code: "FORBIDDEN" | "VALIDATION" | "NOT_FOUND";

  constructor(code: "FORBIDDEN" | "VALIDATION" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "LiveTvManagementError";
    this.code = code;
  }
}

function assertManager(identity: ManagedLiveTvIdentity): void {
  if (!canManageLiveTv(identity.role)) {
    throw new LiveTvManagementError("FORBIDDEN", "Your role does not have permission to manage Live TV.");
  }
}

function write(input: LiveTvFormInput, actorId: string, allowedHlsHosts: readonly string[]): Update {
  const parsed = liveTvFormSchema.safeParse(input);
  if (!parsed.success) throw new LiveTvManagementError("VALIDATION", "Check the Live TV fields and try again.");
  const values = parsed.data;
  let provider;
  let schedule;
  try {
    provider = parseLiveTvProviderConfiguration(input, allowedHlsHosts);
    schedule = validateSchedule({
      state: values.status,
      startsAt: values.scheduleStart,
      endsAt: values.scheduleEnd,
    });
  } catch (error) {
    throw new LiveTvManagementError(
      "VALIDATION",
      error instanceof Error ? error.message : "The Live TV configuration is invalid.",
    );
  }
  return {
    language_id: values.languageId,
    internal_name: values.streamTitle,
    title: values.currentProgramme,
    description: values.programmeDescription,
    provider: provider.provider,
    provider_stream_id: provider.providerStreamId,
    stream_url: provider.streamUrl,
    external_watch_url: provider.externalWatchUrl,
    poster_url: values.posterUrl,
    poster_alt_text: values.posterAltText,
    status: schedule.state,
    autoplay: provider.autoplay,
    muted: provider.muted,
    starts_at: schedule.startsAt,
    ends_at: schedule.endsAt,
    offline_message: values.shortDescription,
    related_story_id: values.relatedStoryId,
    related_category_id: values.relatedCategoryId,
    seo_title: values.seoTitle,
    seo_description: values.seoDescription,
    social_image_url: values.openGraphImageUrl,
    updated_by: actorId,
  };
}

export function createLiveTvOperations(
  repository: LiveTvWriteRepository,
  configuration: Readonly<{ allowedHlsHosts: readonly string[] }>,
) {
  return {
    async create(identity: ManagedLiveTvIdentity, input: LiveTvFormInput) {
      assertManager(identity);
      return repository.create({
        ...write(input, identity.id, configuration.allowedHlsHosts),
        created_by: identity.id,
      } as Insert);
    },
    async update(identity: ManagedLiveTvIdentity, id: string, input: LiveTvFormInput) {
      assertManager(identity);
      return repository.update(id, write(input, identity.id, configuration.allowedHlsHosts));
    },
    async remove(identity: ManagedLiveTvIdentity, id: string) {
      assertManager(identity);
      if (!canRemoveLiveTv(identity.role)) {
        throw new LiveTvManagementError("FORBIDDEN", "Only an administrator can remove a Live TV configuration.");
      }
      await repository.remove(id);
    },
  } as const;
}
