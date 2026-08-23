import "server-only";

export { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";
import { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";

import { env } from "../../../../config/env.ts";

const canonicalRecordingKey = /^reporter-live\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/u;
export async function signPrivateRecordingPreview(key: string, expiresInSeconds: number): Promise<string> {
  const storage = env.server.liveKitStorage;
  if (!storage.accessKey || !storage.secret || !storage.bucket || !storage.region
    || expiresInSeconds !== 60 || !canonicalRecordingKey.test(key)) {
    throw new Error("Private recording preview configuration is unavailable.");
  }
  return createAwsS3Presigner({
    accessKey: storage.accessKey,
    secret: storage.secret,
    bucket: storage.bucket,
    region: storage.region,
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle,
  }).signGet(key, 60);
}
