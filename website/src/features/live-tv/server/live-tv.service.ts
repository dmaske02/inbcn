import "server-only";

import {
  getLiveChannel,
  getLiveChannelByLanguage,
  getLiveSchedule,
} from "./live-tv.repository.ts";
import { mapLiveStreamRow } from "./live-tv.model.ts";

export async function getLiveStreamData(id: string) {
  const row = await getLiveChannel(id);
  return row ? mapLiveStreamRow(row) : null;
}

export async function getLocalizedLiveStreamData(languageCode: string) {
  const row = await getLiveChannelByLanguage(languageCode);
  return row ? mapLiveStreamRow(row) : null;
}

export async function getLiveStreamSchedule(id: string) {
  return getLiveSchedule(id);
}
