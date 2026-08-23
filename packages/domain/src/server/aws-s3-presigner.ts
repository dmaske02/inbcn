import "server-only";

import { createHash, createHmac } from "node:crypto";

const bucketName = /^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])$/u;
const regionName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

type PresignerConfig = Readonly<{
  accessKey: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}>;

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUri(key: string, bucket: string, pathStyle: boolean): string {
  const segments = pathStyle ? [bucket, ...key.split("/")] : key.split("/");
  return `/${segments.map(awsEncode).join("/")}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function amzDate(now: Date): Readonly<{ date: string; timestamp: string }> {
  const iso = now.toISOString();
  return {
    date: iso.slice(0, 10).replaceAll("-", ""),
    timestamp: `${iso.slice(0, 10).replaceAll("-", "")}T${iso.slice(11, 19).replaceAll(":", "")}Z`,
  };
}

function endpointFor(config: PresignerConfig): URL {
  const endpoint = new URL(config.endpoint
    ?? (config.region === "us-east-1"
      ? "https://s3.amazonaws.com"
      : `https://s3.${config.region}.amazonaws.com`));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password
    || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) {
    throw new Error("Private object configuration is unavailable.");
  }
  if (!config.forcePathStyle) endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  return endpoint;
}

export function createAwsS3Presigner(config: PresignerConfig) {
  if (!config.accessKey || config.accessKey.length > 256
    || !config.secret || config.secret.length > 512
    || !bucketName.test(config.bucket) || !regionName.test(config.region)) {
    throw new Error("Private object configuration is unavailable.");
  }
  const endpoint = endpointFor(config);

  function sign(method: "DELETE" | "GET" | "HEAD", key: string, expiresInSeconds: number, now = new Date()): string {
    if (!key || key.length > 1024 || key.startsWith("/") || key.includes("\\")
      || !Number.isInteger(expiresInSeconds)
      || expiresInSeconds < 1 || expiresInSeconds > 604_800
      || !Number.isFinite(now.getTime())) {
      throw new Error("Private object is unavailable.");
    }
    const date = amzDate(now);
    const scope = `${date.date}/${config.region}/s3/aws4_request`;
    const query = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", `${config.accessKey}/${scope}`],
      ["X-Amz-Date", date.timestamp],
      ["X-Amz-Expires", String(expiresInSeconds)],
      ["X-Amz-SignedHeaders", "host"],
    ].map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`).sort().join("&");
    const uri = canonicalUri(key, config.bucket, config.forcePathStyle);
    const canonicalRequest = [
      method,
      uri,
      query,
      `host:${endpoint.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      date.timestamp,
      scope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = createHmac("sha256", signingKey(config.secret, date.date, config.region))
      .update(stringToSign, "utf8").digest("hex");
    return `${endpoint.origin}${uri}?${query}&X-Amz-Signature=${signature}`;
  }

  return {
    signDelete: (key: string, expiresInSeconds: number, now?: Date) =>
      sign("DELETE", key, expiresInSeconds, now),
    signGet: (key: string, expiresInSeconds: number, now?: Date) =>
      sign("GET", key, expiresInSeconds, now),
    signHead: (key: string, expiresInSeconds: number, now?: Date) =>
      sign("HEAD", key, expiresInSeconds, now),
  } as const;
}
