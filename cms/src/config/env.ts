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

const optionalLiveKitUrl = z.preprocess(
  emptyStringToUndefined,
  z.url({ protocol: /^(?:https?|wss?)$/ }).optional(),
);

const optionalBooleanString = z.preprocess(
  emptyStringToUndefined,
  z.enum(["true", "false"]).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    NEXT_PUBLIC_CMS_URL: optionalHttpUrl,

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
    CRON_SECRET: optionalString,

    WEBSITE_URL: optionalHttpUrl,
    WEBSITE_REVALIDATION_SECRET: optionalString,
    LIVE_TV_HLS_ALLOWED_HOSTS: optionalString,

    LIVEKIT_URL: optionalLiveKitUrl,
    LIVEKIT_API_KEY: optionalString,
    LIVEKIT_API_SECRET: optionalString,
    LIVEKIT_S3_ACCESS_KEY: optionalString,
    LIVEKIT_S3_SECRET: optionalString,
    LIVEKIT_S3_BUCKET: optionalString,
    LIVEKIT_S3_ENDPOINT: optionalHttpUrl,
    LIVEKIT_S3_REGION: optionalString,
    LIVEKIT_S3_FORCE_PATH_STYLE: optionalBooleanString,

    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,

    HOMEPAGE_BUILDER_ENABLED: z.enum(["true", "false"]).default("false"),

  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === "production" && !values.NEXT_PUBLIC_CMS_URL) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_CMS_URL"],
        message: "NEXT_PUBLIC_CMS_URL is required in production.",
      });
    }

    const liveKitEntries = [
      ["LIVEKIT_URL", values.LIVEKIT_URL],
      ["LIVEKIT_API_KEY", values.LIVEKIT_API_KEY],
      ["LIVEKIT_API_SECRET", values.LIVEKIT_API_SECRET],
    ] as const;
    if (liveKitEntries.some(([, value]) => value)) {
      for (const [name, value] of liveKitEntries) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required when LiveKit is configured.`,
          });
        }
      }
    }

    const liveKitStorageEntries = [
      ["LIVEKIT_S3_ACCESS_KEY", values.LIVEKIT_S3_ACCESS_KEY],
      ["LIVEKIT_S3_SECRET", values.LIVEKIT_S3_SECRET],
      ["LIVEKIT_S3_BUCKET", values.LIVEKIT_S3_BUCKET],
      ["LIVEKIT_S3_REGION", values.LIVEKIT_S3_REGION],
    ] as const;
    if (liveKitStorageEntries.some(([, value]) => value)
      || values.LIVEKIT_S3_ENDPOINT || values.LIVEKIT_S3_FORCE_PATH_STYLE) {
      for (const [name, value] of liveKitStorageEntries) {
        if (!value) context.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when private LiveKit storage is configured.`,
        });
      }
    }

    const razorpayEntries = [
      ["RAZORPAY_KEY_ID", values.RAZORPAY_KEY_ID],
      ["RAZORPAY_KEY_SECRET", values.RAZORPAY_KEY_SECRET],
    ] as const;
    if (razorpayEntries.some(([, value]) => value)) {
      for (const [name, value] of razorpayEntries) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required when Razorpay is configured.`,
          });
        }
      }
    }
  });

const parsedEnvironment = environmentSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,

  NEXT_PUBLIC_CMS_URL: process.env.NEXT_PUBLIC_CMS_URL,

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
  CRON_SECRET: process.env.CRON_SECRET,
  WEBSITE_URL: process.env.WEBSITE_URL,
  WEBSITE_REVALIDATION_SECRET: process.env.WEBSITE_REVALIDATION_SECRET,
  LIVE_TV_HLS_ALLOWED_HOSTS: process.env.LIVE_TV_HLS_ALLOWED_HOSTS,

  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  LIVEKIT_S3_ACCESS_KEY: process.env.LIVEKIT_S3_ACCESS_KEY,
  LIVEKIT_S3_SECRET: process.env.LIVEKIT_S3_SECRET,
  LIVEKIT_S3_BUCKET: process.env.LIVEKIT_S3_BUCKET,
  LIVEKIT_S3_ENDPOINT: process.env.LIVEKIT_S3_ENDPOINT,
  LIVEKIT_S3_REGION: process.env.LIVEKIT_S3_REGION,
  LIVEKIT_S3_FORCE_PATH_STYLE: process.env.LIVEKIT_S3_FORCE_PATH_STYLE,

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,

  HOMEPAGE_BUILDER_ENABLED: process.env.HOMEPAGE_BUILDER_ENABLED,

});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid environment configuration:\n${z.prettifyError(parsedEnvironment.error)}`,
  );
}

const values = parsedEnvironment.data;

export const env = Object.freeze({
  public: Object.freeze({
    appUrl: values.NEXT_PUBLIC_CMS_URL,
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
    liveKit: Object.freeze({
      url: values.LIVEKIT_URL,
      apiKey: values.LIVEKIT_API_KEY,
      apiSecret: values.LIVEKIT_API_SECRET,
    }),
    liveKitStorage: Object.freeze({
      accessKey: values.LIVEKIT_S3_ACCESS_KEY,
      secret: values.LIVEKIT_S3_SECRET,
      bucket: values.LIVEKIT_S3_BUCKET,
      endpoint: values.LIVEKIT_S3_ENDPOINT,
      region: values.LIVEKIT_S3_REGION,
      forcePathStyle: values.LIVEKIT_S3_FORCE_PATH_STYLE === "true",
    }),
    razorpay: Object.freeze({
      keyId: values.RAZORPAY_KEY_ID,
      keySecret: values.RAZORPAY_KEY_SECRET,
    }),
    homepageBuilder: Object.freeze({
      enabled: values.HOMEPAGE_BUILDER_ENABLED === "true",
    }),
  }),
});

export type Environment = typeof env;
