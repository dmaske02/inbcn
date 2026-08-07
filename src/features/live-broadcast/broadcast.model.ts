import { z } from "zod";

import {
  BROADCAST_LANGUAGES,
  type BroadcastLanguage,
  type BroadcastRole,
  type BroadcastRoomName,
  type BroadcastRoomOptions,
  type BroadcastTokenInput,
} from "./broadcast.types.ts";

export const broadcastLanguageSchema = z.enum(BROADCAST_LANGUAGES);
export const broadcastRoleSchema = z.enum(["broadcaster", "viewer", "admin"]);

const broadcastTokenInputSchema = z.object({
  identity: z.string().trim().min(1, "Participant identity is required.").max(128),
  language: broadcastLanguageSchema,
  role: broadcastRoleSchema,
});

const broadcastRoomOptionsSchema = z.object({
  emptyTimeout: z.number().int().positive().optional(),
  maxParticipants: z.number().int().positive().optional(),
});

export function toBroadcastRoomName(language: unknown): BroadcastRoomName {
  const parsed = broadcastLanguageSchema.safeParse(language);
  if (!parsed.success) {
    throw new TypeError("Unsupported broadcast language.");
  }
  return `broadcast-${parsed.data}`;
}

export function parseBroadcastRoomName(name: string): BroadcastLanguage | null {
  if (!name.startsWith("broadcast-")) return null;
  const parsed = broadcastLanguageSchema.safeParse(name.slice("broadcast-".length));
  return parsed.success ? parsed.data : null;
}

export function parseBroadcastTokenInput(input: unknown): BroadcastTokenInput {
  return broadcastTokenInputSchema.parse(input);
}

export function parseBroadcastRoomOptions(input: unknown): BroadcastRoomOptions {
  return broadcastRoomOptionsSchema.parse(input);
}

export function isBroadcastOperatorRole(
  role: BroadcastRole,
): role is "broadcaster" | "admin" {
  return role === "broadcaster" || role === "admin";
}
