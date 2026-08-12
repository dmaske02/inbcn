"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AdminIdentity } from "@/features/admin/auth/authorization.model";
import { requireAdminUser } from "@/features/admin/auth/server";
import { revalidateWebsite } from "@/features/admin/public-revalidation";
import type { EditorActionResult } from "./editor/homepage-editor.types.ts";
import {
  createVisualManagedHomepageSection,
  deleteVisualManagedHomepageSection,
  duplicateVisualManagedHomepageSection,
  moveVisualManagedHomepageSectionTo,
  saveVisualManagedHomepageSection,
  setVisualManagedHomepageSectionEnabled,
} from "./homepage-builder.service.ts";
import { HomepageBuilderError } from "./homepage-builder.model.ts";
import { HomepageMutationConflictError } from "./homepage-builder.operations.ts";
import { HOMEPAGE_CONTAINERS, HOMEPAGE_LOCALES, HOMEPAGE_WIDTHS } from "./homepage-builder.types.ts";
import { searchCategories, searchStories } from "./search/homepage-picker.service.ts";

const localeSchema = z.enum(HOMEPAGE_LOCALES);
const idSchema = z.uuid();
const scheduleSchema = z.union([z.string().refine((value) => Number.isFinite(Date.parse(value))), z.null()]);
const commonVisualFields = {
  title: z.string().trim().min(1).max(180),
  container: z.enum(HOMEPAGE_CONTAINERS),
  width: z.enum(HOMEPAGE_WIDTHS),
  enabled: z.boolean(),
  startsAt: scheduleSchema,
  endsAt: scheduleSchema,
} as const;
const listFields = { ...commonVisualFields, limit: z.number().int().min(1).max(100) } as const;
const visualSectionSchema = z.discriminatedUnion("blockType", [
  z.object({ ...commonVisualFields, blockType: z.literal("hero-story"), storyId: idSchema }).strict(),
  z.object({
    ...commonVisualFields,
    blockType: z.literal("hero-sidebar"),
    storyIds: z.array(idSchema).min(1).max(3).refine(
      (items) => new Set(items).size === items.length,
      "Hero Sidebar stories must be unique.",
    ),
  }).strict(),
  z.object({ ...listFields, blockType: z.literal("breaking-news") }).strict(),
  z.object({ ...commonVisualFields, blockType: z.literal("live-tv") }).strict(),
  z.object({ ...listFields, blockType: z.literal("latest-news") }).strict(),
  z.object({ ...listFields, blockType: z.literal("category-section"), categoryId: idSchema }).strict(),
  z.object({ ...listFields, blockType: z.literal("trending") }).strict(),
  z.object({ ...listFields, blockType: z.literal("opinion") }).strict(),
  z.object({ ...commonVisualFields, blockType: z.literal("advertisement-placeholder"), label: z.string().trim().min(1).max(120) }).strict(),
  z.object({ ...commonVisualFields, blockType: z.literal("custom-html-placeholder"), content: z.string().max(10_000) }).strict(),
  z.object({ ...commonVisualFields, blockType: z.literal("future-placeholder"), note: z.string().max(500) }).strict(),
]);
const pickerSearchSchema = z.object({ locale: localeSchema, query: z.string().optional(), page: z.number().int().optional() }).strict();
const createVisualSchema = z.object({ locale: localeSchema, section: visualSectionSchema }).strict();
const saveVisualSchema = z.object({ locale: localeSchema, id: idSchema, expectedUpdatedAt: z.iso.datetime({ offset: true }), section: visualSectionSchema }).strict();
const setEnabledSchema = z.object({ locale: localeSchema, id: idSchema, expectedUpdatedAt: z.iso.datetime({ offset: true }), enabled: z.boolean() }).strict();
const moveVisualSchema = z.object({
  locale: localeSchema,
  sectionId: idSchema,
  targetPosition: z.number().int().nonnegative(),
  expectedOrder: z.array(idSchema).min(1).refine((items) => new Set(items).size === items.length, "Section order contains duplicates."),
}).strict();
const structuralMutationSchema = z.object({
  locale: localeSchema,
  id: idSchema,
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  expectedOrder: z.array(idSchema).min(1).refine((items) => new Set(items).size === items.length, "Section order contains duplicates."),
}).strict();

function validationFailure(error: z.ZodError): EditorActionResult<never> {
  const fieldErrors = Object.fromEntries(
    error.issues.map((issue) => [String(issue.path.at(-1) ?? "form"), issue.message]),
  );
  return { ok: false, code: "VALIDATION", message: "Check the submitted fields and try again.", fieldErrors };
}

function safeDomainFailure(error: unknown): EditorActionResult<never> | null {
  if (error instanceof HomepageBuilderError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof HomepageMutationConflictError) {
    return { ok: false, code: "CONFLICT", message: error.message };
  }
  return null;
}

function unexpectedFailure(action: string, error: unknown): EditorActionResult<never> {
  console.error("[homepage-builder-action]", {
    action,
    code: "UNEXPECTED",
    exceptionName: error instanceof Error ? error.name : "UnknownError",
  });
  return { ok: false, code: "PERSISTENCE", message: "The Homepage Builder could not complete that request. Try again." };
}

async function runInteractiveAction<Schema extends z.ZodType, Result>(
  action: string,
  schema: Schema,
  inputValue: unknown,
  work: (admin: AdminIdentity, input: z.output<Schema>) => Promise<Result>,
): Promise<EditorActionResult<Result>> {
  const admin = await requireAdminUser();
  const parsed = schema.safeParse(inputValue);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const result = await work(admin, parsed.data);
    return { ok: true, data: result };
  } catch (error) {
    return safeDomainFailure(error) ?? unexpectedFailure(action, error);
  }
}

async function runHomepageMutation<Schema extends z.ZodType, Result>(
  action: string,
  schema: Schema,
  inputValue: unknown,
  work: (admin: AdminIdentity, input: z.output<Schema>) => Promise<Result>,
): Promise<EditorActionResult<Result>> {
  const admin = await requireAdminUser();
  const parsed = schema.safeParse(inputValue);
  if (!parsed.success) return validationFailure(parsed.error);
  try {
    const result = await work(admin, parsed.data);
    await revalidateHomepageMutation();
    return { ok: true, data: result };
  } catch (error) {
    return safeDomainFailure(error) ?? unexpectedFailure(action, error);
  }
}

async function revalidateHomepageMutation(): Promise<void> {
  revalidatePath("/admin/homepage-builder");
  await revalidateWebsite("homepage");
}

export async function searchHomepageStories(inputValue: unknown) {
  return runInteractiveAction("searchHomepageStories", pickerSearchSchema, inputValue, async (_admin, value) => searchStories(value));
}

export async function searchHomepageCategories(inputValue: unknown) {
  return runInteractiveAction("searchHomepageCategories", pickerSearchSchema, inputValue, async (_admin, value) => searchCategories(value));
}

export async function createVisualHomepageSection(inputValue: unknown) {
  return runHomepageMutation("createVisualHomepageSection", createVisualSchema, inputValue, async (admin, value) =>
    createVisualManagedHomepageSection(admin, value.locale, value.section));
}

export async function saveVisualHomepageSection(inputValue: unknown) {
  return runHomepageMutation("saveVisualHomepageSection", saveVisualSchema, inputValue, async (admin, value) =>
    saveVisualManagedHomepageSection(admin, value.locale, value.id, value.expectedUpdatedAt, value.section));
}

export async function setVisualHomepageSectionEnabled(inputValue: unknown) {
  return runHomepageMutation("setVisualHomepageSectionEnabled", setEnabledSchema, inputValue, async (admin, value) =>
    setVisualManagedHomepageSectionEnabled(admin, value.locale, value.id, value.expectedUpdatedAt, value.enabled));
}

export async function moveHomepageSectionTo(inputValue: unknown) {
  return runHomepageMutation("moveHomepageSectionTo", moveVisualSchema, inputValue, async (admin, value) =>
    moveVisualManagedHomepageSectionTo(
      admin,
      value.locale,
      value.sectionId,
      value.targetPosition,
      value.expectedOrder,
    ));
}

export async function duplicateHomepageSection(inputValue: unknown) {
  return runHomepageMutation("duplicateHomepageSection", structuralMutationSchema, inputValue, async (admin, value) =>
    duplicateVisualManagedHomepageSection(
      admin, value.locale, value.id, value.expectedUpdatedAt, value.expectedOrder,
    ));
}

export async function deleteHomepageSection(inputValue: unknown) {
  return runHomepageMutation("deleteHomepageSection", structuralMutationSchema, inputValue, async (admin, value) =>
    deleteVisualManagedHomepageSection(
      admin, value.locale, value.id, value.expectedUpdatedAt, value.expectedOrder,
    ));
}
