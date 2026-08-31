import "server-only";

import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);
const optionalCronSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(32).optional(),
);
const optionalHttpUrl = z.preprocess(
  emptyStringToUndefined,
  z.url({ protocol: /^https?$/ }).optional(),
);
const optionalLiveKitUrl = z.preprocess(
  emptyStringToUndefined,
  z.url({ protocol: /^(?:https?|wss?)$/ }).refine((value) => {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password && parsed.pathname === "/"
      && !parsed.search && !parsed.hash
      && (parsed.href === parsed.origin || parsed.href === `${parsed.origin}/`);
  }, "LIVEKIT_URL must contain only a protocol and host.").optional(),
);

const environmentSchema = z
  .object({
    NEXT_PUBLIC_REPORTER_URL: optionalHttpUrl,
    NEXT_PUBLIC_SUPABASE_URL: optionalHttpUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
    KYC_ENABLED: z.enum(["true", "false"]).default("false"),
    KYC_PROVIDER: optionalString,
    KYC_BASE_URL: optionalHttpUrl,
    KYC_CLIENT_ID: optionalString,
    KYC_CLIENT_SECRET: optionalString,
    KYC_WEBHOOK_SECRET: optionalString,
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    LIVEKIT_URL: optionalLiveKitUrl,
    LIVEKIT_API_KEY: optionalString,
    LIVEKIT_API_SECRET: optionalString,
    LIVEKIT_S3_ACCESS_KEY: optionalString,
    LIVEKIT_S3_SECRET: optionalString,
    LIVEKIT_S3_BUCKET: optionalString,
    LIVEKIT_S3_ENDPOINT: optionalHttpUrl,
    LIVEKIT_S3_REGION: optionalString,
    LIVEKIT_S3_FORCE_PATH_STYLE: z.preprocess(
      emptyStringToUndefined,
      z.enum(["true", "false"]).optional(),
    ),
    CRON_SECRET: optionalCronSecret,
    SMS_NOTIFICATIONS_ENABLED: z.enum(["true", "false"]).default("false"),
    REPORTER_DEMO_MODE: z.enum(["true", "false"]).default("false"),
    REPORTER_TEMPORARY_ONBOARDING: z.enum(["true", "false"]).default("false"),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  })
  .superRefine((values, context) => {
    const requireAll = (entries: readonly (readonly [string, unknown])[], label: string) => {
      if (!entries.some(([, value]) => value)) return;

      for (const [name, value] of entries) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required when ${label} is configured.`,
          });
        }
      }
    };

    requireAll(
      [
        ["NEXT_PUBLIC_RAZORPAY_KEY_ID", values.NEXT_PUBLIC_RAZORPAY_KEY_ID],
        ["RAZORPAY_KEY_ID", values.RAZORPAY_KEY_ID],
        ["RAZORPAY_KEY_SECRET", values.RAZORPAY_KEY_SECRET],
        ["RAZORPAY_WEBHOOK_SECRET", values.RAZORPAY_WEBHOOK_SECRET],
      ],
      "Razorpay",
    );
    requireAll(
      [
        ["CLOUDINARY_CLOUD_NAME", values.CLOUDINARY_CLOUD_NAME],
        ["CLOUDINARY_API_KEY", values.CLOUDINARY_API_KEY],
        ["CLOUDINARY_API_SECRET", values.CLOUDINARY_API_SECRET],
      ],
      "Cloudinary",
    );
    requireAll(
      [
        ["LIVEKIT_URL", values.LIVEKIT_URL],
        ["LIVEKIT_API_KEY", values.LIVEKIT_API_KEY],
        ["LIVEKIT_API_SECRET", values.LIVEKIT_API_SECRET],
      ],
      "LiveKit",
    );
    if ([
      values.LIVEKIT_S3_ACCESS_KEY,
      values.LIVEKIT_S3_SECRET,
      values.LIVEKIT_S3_BUCKET,
      values.LIVEKIT_S3_ENDPOINT,
      values.LIVEKIT_S3_REGION,
      values.LIVEKIT_S3_FORCE_PATH_STYLE === "true",
    ].some(Boolean)) {
      for (const [name, value] of [
        ["LIVEKIT_S3_ACCESS_KEY", values.LIVEKIT_S3_ACCESS_KEY],
        ["LIVEKIT_S3_SECRET", values.LIVEKIT_S3_SECRET],
        ["LIVEKIT_S3_BUCKET", values.LIVEKIT_S3_BUCKET],
      ] as const) {
        if (!value) context.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when private LiveKit storage is configured.`,
        });
      }
    }

    if (values.KYC_ENABLED === "true") {
      for (const [name, value] of [
        ["KYC_PROVIDER", values.KYC_PROVIDER],
        ["KYC_BASE_URL", values.KYC_BASE_URL],
        ["KYC_CLIENT_ID", values.KYC_CLIENT_ID],
        ["KYC_CLIENT_SECRET", values.KYC_CLIENT_SECRET],
        ["KYC_WEBHOOK_SECRET", values.KYC_WEBHOOK_SECRET],
      ] as const) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required when KYC_ENABLED is true.`,
          });
        }
      }
    }

    if (values.SMS_NOTIFICATIONS_ENABLED === "true") {
      // ponytail: SMS has no provider contract yet; add validated credentials before enabling it.
      context.addIssue({
        code: "custom",
        path: ["SMS_NOTIFICATIONS_ENABLED"],
        message:
          "SMS_NOTIFICATIONS_ENABLED requires a configured SMS provider.",
      });
    }
    if (values.REPORTER_TEMPORARY_ONBOARDING === "true"
      && values.VERCEL_ENV === "production") {
      context.addIssue({
        code: "custom",
        path: ["REPORTER_TEMPORARY_ONBOARDING"],
        message: "REPORTER_TEMPORARY_ONBOARDING cannot be enabled in production.",
      });
    }
  });

const parsedEnvironment = environmentSchema.safeParse({
  NEXT_PUBLIC_REPORTER_URL: process.env.NEXT_PUBLIC_REPORTER_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  KYC_ENABLED: process.env.KYC_ENABLED,
  KYC_PROVIDER: process.env.KYC_PROVIDER,
  KYC_BASE_URL: process.env.KYC_BASE_URL,
  KYC_CLIENT_ID: process.env.KYC_CLIENT_ID,
  KYC_CLIENT_SECRET: process.env.KYC_CLIENT_SECRET,
  KYC_WEBHOOK_SECRET: process.env.KYC_WEBHOOK_SECRET,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  LIVEKIT_S3_ACCESS_KEY: process.env.LIVEKIT_S3_ACCESS_KEY,
  LIVEKIT_S3_SECRET: process.env.LIVEKIT_S3_SECRET,
  LIVEKIT_S3_BUCKET: process.env.LIVEKIT_S3_BUCKET,
  LIVEKIT_S3_ENDPOINT: process.env.LIVEKIT_S3_ENDPOINT,
  LIVEKIT_S3_REGION: process.env.LIVEKIT_S3_REGION,
  LIVEKIT_S3_FORCE_PATH_STYLE: process.env.LIVEKIT_S3_FORCE_PATH_STYLE,
  CRON_SECRET: process.env.CRON_SECRET,
  SMS_NOTIFICATIONS_ENABLED: process.env.SMS_NOTIFICATIONS_ENABLED,
  REPORTER_DEMO_MODE: process.env.REPORTER_DEMO_MODE,
  REPORTER_TEMPORARY_ONBOARDING: process.env.REPORTER_TEMPORARY_ONBOARDING,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid reporter environment configuration:\n${z.prettifyError(parsedEnvironment.error)}`,
  );
}

const values = parsedEnvironment.data;

export const env = Object.freeze({
  public: Object.freeze({
    appUrl: values.NEXT_PUBLIC_REPORTER_URL,
    supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    razorpayKeyId: values.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  }),
  server: Object.freeze({
    supabaseServiceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
    razorpay: Object.freeze({
      keyId: values.RAZORPAY_KEY_ID,
      keySecret: values.RAZORPAY_KEY_SECRET,
      webhookSecret: values.RAZORPAY_WEBHOOK_SECRET,
    }),
    kyc: Object.freeze({
      enabled: values.KYC_ENABLED === "true",
      provider: values.KYC_PROVIDER,
      baseUrl: values.KYC_BASE_URL,
      clientId: values.KYC_CLIENT_ID,
      clientSecret: values.KYC_CLIENT_SECRET,
      webhookSecret: values.KYC_WEBHOOK_SECRET,
    }),
    cloudinary: Object.freeze({
      cloudName: values.CLOUDINARY_CLOUD_NAME,
      apiKey: values.CLOUDINARY_API_KEY,
      apiSecret: values.CLOUDINARY_API_SECRET,
    }),
    liveKit: Object.freeze({
      url: values.LIVEKIT_URL,
      apiKey: values.LIVEKIT_API_KEY,
      apiSecret: values.LIVEKIT_API_SECRET,
      storage: Object.freeze({
        accessKey: values.LIVEKIT_S3_ACCESS_KEY,
        secret: values.LIVEKIT_S3_SECRET,
        bucket: values.LIVEKIT_S3_BUCKET,
        endpoint: values.LIVEKIT_S3_ENDPOINT,
        region: values.LIVEKIT_S3_REGION,
        forcePathStyle: values.LIVEKIT_S3_FORCE_PATH_STYLE === "true",
      }),
    }),
    cronSecret: values.CRON_SECRET,
    smsNotificationsEnabled: values.SMS_NOTIFICATIONS_ENABLED === "true",
    demoMode: values.REPORTER_DEMO_MODE === "true",
    temporaryOnboarding: values.REPORTER_TEMPORARY_ONBOARDING === "true",
  }),
});

export type Environment = typeof env;
