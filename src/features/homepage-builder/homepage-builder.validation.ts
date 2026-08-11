import { z } from "zod";
import { HomepageBuilderError } from "./homepage-builder.model.ts";
import { getHomepageBlockDefinition } from "./homepage-builder.registry.ts";
import { HOMEPAGE_CONTAINERS, HOMEPAGE_WIDTHS, type HomepageSectionInput } from "./homepage-builder.types.ts";

const baseSchema = z.object({ blockId: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(180), blockType: z.string(), renderer: z.string(), container: z.enum(HOMEPAGE_CONTAINERS), width: z.enum(HOMEPAGE_WIDTHS), enabled: z.boolean(), startsAt: z.union([z.string(), z.null()]), endsAt: z.union([z.string(), z.null()]), configuration: z.unknown() });
function date(value: string | null) { return value?.trim() ? new Date(value).toISOString() : null; }
export function parseHomepageSectionInput(input: HomepageSectionInput) {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) throw new HomepageBuilderError("VALIDATION", "Check the homepage section fields and try again.");
  const definition = getHomepageBlockDefinition(parsed.data.blockType);
  if (!definition) throw new HomepageBuilderError("VALIDATION", "Unsupported block type.");
  if (definition.renderer !== parsed.data.renderer) throw new HomepageBuilderError("VALIDATION", "The renderer does not match the block type.");
  let configuration = parsed.data.configuration;
  if (typeof configuration === "string") { try { configuration = JSON.parse(configuration); } catch { throw new HomepageBuilderError("VALIDATION", "Configuration must contain valid JSON."); } }
  const configured = definition.validate(configuration);
  if (!configured.success) throw new HomepageBuilderError("VALIDATION", configured.error.issues[0]?.message ?? "The block configuration is invalid.");
  const startsAt = date(parsed.data.startsAt); const endsAt = date(parsed.data.endsAt);
  if (endsAt && (!startsAt || Date.parse(endsAt) <= Date.parse(startsAt))) throw new HomepageBuilderError("VALIDATION", "Schedule end must be after schedule start.");
  return { ...parsed.data, startsAt, endsAt, configuration: configured.data };
}
