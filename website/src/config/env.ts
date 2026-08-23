import "server-only";

import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());
const optionalHttpUrl = z.preprocess(emptyStringToUndefined, z.url({ protocol: /^https?$/ }).optional());
const optionalLiveKitUrl = z.preprocess(emptyStringToUndefined, z.url({ protocol: /^(?:https?|wss?)$/ }).optional());
const optionalBooleanString = z.preprocess(emptyStringToUndefined, z.enum(["true", "false"]).optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: optionalHttpUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalHttpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  LIVEKIT_S3_ACCESS_KEY: optionalString,
  LIVEKIT_S3_SECRET: optionalString,
  LIVEKIT_S3_BUCKET: optionalString,
  LIVEKIT_S3_ENDPOINT: optionalHttpUrl,
  LIVEKIT_S3_REGION: optionalString,
  LIVEKIT_S3_FORCE_PATH_STYLE: optionalBooleanString,
  LIVE_TV_HLS_ALLOWED_HOSTS: optionalString,
  HOMEPAGE_BUILDER_ENABLED: z.enum(["true", "false"]).default("false"),
  LIVEKIT_URL: optionalLiveKitUrl,
  LIVEKIT_API_KEY: optionalString,
  LIVEKIT_API_SECRET: optionalString,
}).superRefine((values, context) => {
  if (values.NODE_ENV === "production" && !values.NEXT_PUBLIC_APP_URL) {
    context.addIssue({ code: "custom", path: ["NEXT_PUBLIC_APP_URL"], message: "NEXT_PUBLIC_APP_URL is required in production." });
  }
  const liveKit = [["LIVEKIT_URL", values.LIVEKIT_URL], ["LIVEKIT_API_KEY", values.LIVEKIT_API_KEY], ["LIVEKIT_API_SECRET", values.LIVEKIT_API_SECRET]] as const;
  if (liveKit.some(([, value]) => value)) for (const [name, value] of liveKit) if (!value) context.addIssue({ code: "custom", path: [name], message: `${name} is required when LiveKit is configured.` });
  const replayStorage = [
    ["SUPABASE_SERVICE_ROLE_KEY", values.SUPABASE_SERVICE_ROLE_KEY],
    ["LIVEKIT_S3_ACCESS_KEY", values.LIVEKIT_S3_ACCESS_KEY],
    ["LIVEKIT_S3_SECRET", values.LIVEKIT_S3_SECRET],
    ["LIVEKIT_S3_BUCKET", values.LIVEKIT_S3_BUCKET],
    ["LIVEKIT_S3_REGION", values.LIVEKIT_S3_REGION],
  ] as const;
  if (replayStorage.some(([, value]) => value)
    || values.LIVEKIT_S3_ENDPOINT || values.LIVEKIT_S3_FORCE_PATH_STYLE === "true") {
    for (const [name, value] of replayStorage) if (!value) context.addIssue({
      code: "custom",
      path: [name],
      message: `${name} is required when private replay delivery is configured.`,
    });
  }
});

const parsed = schema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  LIVEKIT_S3_ACCESS_KEY: process.env.LIVEKIT_S3_ACCESS_KEY,
  LIVEKIT_S3_SECRET: process.env.LIVEKIT_S3_SECRET,
  LIVEKIT_S3_BUCKET: process.env.LIVEKIT_S3_BUCKET,
  LIVEKIT_S3_ENDPOINT: process.env.LIVEKIT_S3_ENDPOINT,
  LIVEKIT_S3_REGION: process.env.LIVEKIT_S3_REGION,
  LIVEKIT_S3_FORCE_PATH_STYLE: process.env.LIVEKIT_S3_FORCE_PATH_STYLE,
  LIVE_TV_HLS_ALLOWED_HOSTS: process.env.LIVE_TV_HLS_ALLOWED_HOSTS,
  HOMEPAGE_BUILDER_ENABLED: process.env.HOMEPAGE_BUILDER_ENABLED,
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
});
if (!parsed.success) throw new Error(`Invalid website environment configuration:\n${z.prettifyError(parsed.error)}`);
const values = parsed.data;

export const env = Object.freeze({
  public: Object.freeze({ appUrl: values.NEXT_PUBLIC_APP_URL, supabaseUrl: values.NEXT_PUBLIC_SUPABASE_URL, supabaseAnonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY, cloudinaryCloudName: values.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME }),
  server: Object.freeze({
    nodeEnv: values.NODE_ENV,
    liveTvHlsAllowedHosts: values.LIVE_TV_HLS_ALLOWED_HOSTS,
    homepageBuilder: Object.freeze({ enabled: values.HOMEPAGE_BUILDER_ENABLED === "true" }),
    liveKit: Object.freeze({ url: values.LIVEKIT_URL, apiKey: values.LIVEKIT_API_KEY, apiSecret: values.LIVEKIT_API_SECRET }),
    replayStorage: Object.freeze({
      supabaseServiceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
      accessKey: values.LIVEKIT_S3_ACCESS_KEY,
      secret: values.LIVEKIT_S3_SECRET,
      bucket: values.LIVEKIT_S3_BUCKET,
      endpoint: values.LIVEKIT_S3_ENDPOINT,
      region: values.LIVEKIT_S3_REGION,
      forcePathStyle: values.LIVEKIT_S3_FORCE_PATH_STYLE === "true",
    }),
  }),
});
