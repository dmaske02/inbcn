import { z } from "zod";

const PUBLIC_REPORTER_LOCALES = ["en", "hi", "mr"] as const;
const PUBLIC_REPORTER_BEATS = [
  "civic",
  "crime",
  "education",
  "environment",
  "health",
  "business",
  "culture",
  "sports",
] as const;

export type PublicReporterStatus = "verified" | "former" | "suspended";

export type PublicReporter = Readonly<{
  slug: string;
  legalName: string;
  photoUrl: string;
  status: PublicReporterStatus;
  district: string;
  bio: string | null;
  beats: readonly string[];
}>;

const publicReporterSlugSchema = z.string().regex(/^[a-z0-9_]{3,32}$/u);
const publicReporterRowSchema = z.object({
  public_slug: publicReporterSlugSchema,
  legal_display_name: z.string().trim().min(2).max(120),
  avatar_url: z.url({ protocol: /^https$/ }).max(2_048).refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }),
  public_status: z.enum(["active", "grace", "expired", "suspended"]),
  home_district: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(500).nullable(),
  beats: z.array(z.enum(PUBLIC_REPORTER_BEATS)).max(PUBLIC_REPORTER_BEATS.length),
}).transform((row): PublicReporter => ({
  slug: row.public_slug,
  legalName: row.legal_display_name,
  photoUrl: new URL(row.avatar_url).toString(),
  status: row.public_status === "expired"
    ? "former"
    : row.public_status === "suspended"
      ? "suspended"
      : "verified",
  district: row.home_district,
  bio: row.bio || null,
  beats: [...new Set(row.beats)],
}));

export function isPublicReporterSlug(value: unknown): value is string {
  return publicReporterSlugSchema.safeParse(value).success;
}

export function mapPublicReporter(row: unknown): PublicReporter | null {
  const parsed = publicReporterRowSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export function resolveStoryReporter(
  storyStatus: string,
  isReporterStory: boolean,
  row: unknown,
): PublicReporter | null {
  return storyStatus === "published" && isReporterStory === true
    ? mapPublicReporter(row)
    : null;
}

export function buildPublicReporterUrl(
  locale: string,
  slug: string,
): string | null {
  return PUBLIC_REPORTER_LOCALES.includes(
    locale as (typeof PUBLIC_REPORTER_LOCALES)[number],
  ) && isPublicReporterSlug(slug)
    ? `/${locale}/reporters/${slug}`
    : null;
}

export function composePublicReporterMetadata(input: Readonly<{
  reporter: PublicReporter | null;
  locale: string;
  siteUrl: string;
}>) {
  if (!input.reporter) return null;
  const path = buildPublicReporterUrl(input.locale, input.reporter.slug);
  if (!path) return null;

  const canonical = new URL(
    path,
    `${input.siteUrl.replace(/\/$/u, "")}/`,
  ).toString();
  return {
    title: input.reporter.legalName,
    description: input.reporter.bio ?? undefined,
    canonical,
    openGraph: {
      title: input.reporter.legalName,
      description: input.reporter.bio ?? undefined,
      url: canonical,
      type: "website",
      images: [input.reporter.photoUrl],
    },
    twitter: {
      card: "summary_large_image",
      title: input.reporter.legalName,
      description: input.reporter.bio ?? undefined,
      images: [input.reporter.photoUrl],
    },
  } as const;
}
