import { z } from "zod";
import { HOMEPAGE_RENDERER_PAIRS, type HomepageRendererPayload } from "./homepage-renderer.types.ts";

const storySchema=z.object({id:z.string().min(1),slug:z.string(),href:z.string().startsWith("/"),title:z.string().min(1),summary:z.string(),publishedAt:z.iso.datetime({offset:true}),categoryId:z.string(),categoryName:z.string().nullable(),categorySlug:z.string().nullable(),isBreaking:z.boolean(),isFeatured:z.boolean(),image:z.object({src:z.string().min(1),alt:z.string(),unoptimized:z.boolean(),width:z.number().nullable(),height:z.number().nullable(),aspectRatio:z.number().nullable()})});
const dataSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("story"),story:storySchema}),
  z.object({kind:z.literal("hero-sidebar"),stories:z.array(storySchema).max(3)}),
  z.object({kind:z.literal("stories"),stories:z.array(storySchema)}),
  z.object({kind:z.literal("category"),category:z.object({id:z.string(),name:z.string(),slug:z.string()}),stories:z.array(storySchema)}),
  z.object({kind:z.literal("live-tv"),view:z.unknown()}),
  z.object({kind:z.literal("placeholder"),label:z.string(),detail:z.string().optional()}),
]);
const sectionSchema = z.object({id:z.string().min(1),blockId:z.string().min(1),title:z.string().min(1),type:z.string(),renderer:z.string(),position:z.number().int().nonnegative(),container:z.enum(["main","sidebar","footer"]),width:z.enum(["full","half","third","quarter"]),data:dataSchema}).superRefine((value,context)=>{if(HOMEPAGE_RENDERER_PAIRS[value.type as keyof typeof HOMEPAGE_RENDERER_PAIRS]!==value.renderer) context.addIssue({code:"custom",message:"Block and renderer pair is invalid."});});
const payloadSchema = z.object({locale:z.enum(["en","hi","mr"]),sections:z.array(sectionSchema).min(1,"Homepage Builder requires an active section.")});

export function parseHomepageRendererPayload(input: unknown): HomepageRendererPayload {
  const parsed=payloadSchema.safeParse(input);
  if(!parsed.success) throw new Error(`Homepage renderer payload is invalid: ${parsed.error.issues[0]?.message ?? "invalid payload"}`);
  if(parsed.data.sections.some((section,index)=>index>0 && section.position<=parsed.data.sections[index-1]!.position)) throw new Error("Homepage sections must be ordered with unique ascending positions.");
  return parsed.data as HomepageRendererPayload;
}
