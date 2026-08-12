import type { Database } from "@/lib/supabase/types";
import type { LiveStreamRow } from "./live-tv.dto.ts";
import type {
  LiveStreamScheduleDto,
  LiveStreamScheduleWrite,
} from "./live-tv.types.ts";

export type LiveStreamInsert =
  Database["public"]["Tables"]["live_streams"]["Insert"];
export type LiveStreamUpdate =
  Database["public"]["Tables"]["live_streams"]["Update"];

export type LiveTvRepositoryAdapter = Readonly<{
  findById(id: string): Promise<LiveStreamRow | null>;
  findByLanguage(languageCode: string): Promise<LiveStreamRow | null>;
  findSchedule(id: string): Promise<LiveStreamScheduleDto | null>;
  insert(value: LiveStreamInsert): Promise<LiveStreamRow>;
  update(id: string, value: LiveStreamUpdate): Promise<LiveStreamRow>;
  remove(id: string): Promise<void>;
}>;

export function createLiveTvRepositoryCore(adapter: LiveTvRepositoryAdapter) {
  return {
    getLiveChannel: (id: string) => adapter.findById(id),
    getLiveChannelByLanguage: (languageCode: string) =>
      adapter.findByLanguage(languageCode),
    getLiveSchedule: (id: string) => adapter.findSchedule(id),
    createLiveChannel: (value: LiveStreamInsert) => adapter.insert(value),
    updateLiveChannel: (id: string, value: LiveStreamUpdate) =>
      adapter.update(id, value),
    deleteLiveChannel: (id: string) => adapter.remove(id),
    createSchedule: (id: string, value: LiveStreamScheduleWrite) =>
      adapter.update(id, value),
    updateSchedule: (id: string, value: LiveStreamScheduleWrite) =>
      adapter.update(id, value),
    deleteSchedule: (
      id: string,
      value: Pick<LiveStreamScheduleWrite, "status">,
    ) => adapter.update(id, { ...value, starts_at: null, ends_at: null }),
  } as const;
}
