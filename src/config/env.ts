import "server-only";

import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalHttpUrl = z.preprocess(
  emptyStringToUndefined,
  z.url({ protocol: /^https?$/ }).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    NEXT_PUBLIC_APP_URL: optionalHttpUrl,

    NEXT_PUBLIC_SUPABASE_URL: optionalHttpUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,

    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,

    NEWSDATA_API_KEY: optionalString,
    AUTO_IMPORT_ENABLED: z.enum(["true", "false"]).default("true"),
    AUTO_IMPORT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
    AUTO_IMPORT_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(3),
    AUTO_IMPORT_TIMEOUT_SECONDS: z.coerce.number().positive().default(120),
    AUTO_IMPORT_SECRET: optionalString,

  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === "production" && !values.NEXT_PUBLIC_APP_URL) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "NEXT_PUBLIC_APP_URL is required in production.",
      });
    }
  });

const parsedEnvironment = environmentSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,

  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,

  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
  AUTO_IMPORT_ENABLED: process.env.AUTO_IMPORT_ENABLED,
  AUTO_IMPORT_INTERVAL_MINUTES: process.env.AUTO_IMPORT_INTERVAL_MINUTES,
  AUTO_IMPORT_RETRY_COUNT: process.env.AUTO_IMPORT_RETRY_COUNT,
  AUTO_IMPORT_TIMEOUT_SECONDS: process.env.AUTO_IMPORT_TIMEOUT_SECONDS,
  AUTO_IMPORT_SECRET: process.env.AUTO_IMPORT_SECRET,

});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid environment configuration:\n${z.prettifyError(parsedEnvironment.error)}`,
  );
}

const values = parsedEnvironment.data;

export const env = Object.freeze({
  public: Object.freeze({
    appUrl: values.NEXT_PUBLIC_APP_URL,
    supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cloudinaryCloudName: values.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  }),
  server: Object.freeze({
    nodeEnv: values.NODE_ENV,
    supabaseServiceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
    cloudinaryCloudName: values.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: values.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: values.CLOUDINARY_API_SECRET,
    newsDataApiKey: values.NEWSDATA_API_KEY,
    autoImport: Object.freeze({
      enabled: values.AUTO_IMPORT_ENABLED.toLowerCase() === "true",
      intervalMinutes: values.AUTO_IMPORT_INTERVAL_MINUTES,
      retryCount: values.AUTO_IMPORT_RETRY_COUNT,
      timeoutSeconds: values.AUTO_IMPORT_TIMEOUT_SECONDS,
      secret: values.AUTO_IMPORT_SECRET,
    }),
  }),
});

export type Environment = typeof env;
