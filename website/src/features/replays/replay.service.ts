import "server-only";

import { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";
import { cache } from "react";

import { isCanonicalReplayId, mapPublicReplay, type PublicReplay } from "./replay.model.ts";

const canonicalRecordingKey = /^reporter-live\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/u;
const noStore = "private, no-store, max-age=0";

type DeliveryDependencies = Readonly<{
  getStorageKey(id: string): Promise<string | null>;
  signObject(key: string, expiresInSeconds: number, method: "GET" | "HEAD"): string | Promise<string>;
  fetchObject(input: string, init: RequestInit): Promise<Response>;
}>;

type ByteRange = Readonly<{ start: bigint; end: bigint | null; header: string }>;

function parseRange(value: string | null): ByteRange | null | false {
  if (value === null) return null;
  const match = /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)?$/u.exec(value);
  if (!match) return false;
  const start = BigInt(match[1]);
  const end = match[2] === undefined ? null : BigInt(match[2]);
  return end !== null && end < start ? false : { start, end, header: value };
}

function fixedResponse(status: 404 | 416 | 503, method: string): Response {
  const messages = {
    404: "Replay not found.",
    416: "Range not satisfiable.",
    503: "Replay unavailable.",
  } as const;
  return new Response(method === "HEAD" ? null : messages[status], {
    status,
    headers: { "cache-control": noStore, "content-type": "text/plain; charset=utf-8" },
  });
}

function safeLength(value: string | null): string | null {
  return value && /^(?:0|[1-9][0-9]*)$/u.test(value) ? value : null;
}

function safeContentRange(value: string | null): string | null {
  const match = value && /^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/u.exec(value);
  if (!match) return null;
  const start = BigInt(match[1]);
  const end = BigInt(match[2]);
  const total = BigInt(match[3]);
  return start <= end && end < total ? value : null;
}

export function createReplayDelivery(dependencies: DeliveryDependencies) {
  return async function deliver(request: Request, id: string): Promise<Response> {
    if (!isCanonicalReplayId(id)) return fixedResponse(404, request.method);
    const range = parseRange(request.headers.get("range"));
    if (range === false) return fixedResponse(416, request.method);

    try {
      const key = await dependencies.getStorageKey(id);
      if (!key) return fixedResponse(404, request.method);
      if (!canonicalRecordingKey.test(key)) return fixedResponse(503, request.method);
      const method = request.method === "HEAD" ? "HEAD" : "GET";
      const upstream = await dependencies.fetchObject(
        await dependencies.signObject(key, 60, method),
        {
          method,
          headers: range ? { range: range.header } : undefined,
          cache: "no-store",
          redirect: "error",
          signal: request.signal,
        },
      );
      if (range && upstream.status === 416) {
        await upstream.body?.cancel().catch(() => undefined);
        return fixedResponse(416, method);
      }
      const expectedStatus = range ? 206 : 200;
      const type = upstream.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      const length = safeLength(upstream.headers.get("content-length"));
      const contentRange = range ? safeContentRange(upstream.headers.get("content-range")) : null;
      if (upstream.status !== expectedStatus
        || (type !== "video/mp4" && type !== "application/octet-stream")
        || !length || (range && !contentRange)
        || (method === "GET" && !upstream.body)) {
        await upstream.body?.cancel().catch(() => undefined);
        return fixedResponse(503, method);
      }
      const headers = new Headers({
        "accept-ranges": "bytes",
        "cache-control": noStore,
        "content-length": length,
        "content-type": "video/mp4",
      });
      if (contentRange) headers.set("content-range", contentRange);
      return new Response(method === "HEAD" ? null : upstream.body, {
        status: expectedStatus,
        headers,
      });
    } catch {
      return fixedResponse(503, request.method);
    }
  };
}

export const getPublicReplay = cache(async (
  id: string,
  locale: string,
): Promise<PublicReplay | null> => {
  if (!isCanonicalReplayId(id) || !["en", "hi", "mr"].includes(locale)) return null;
  const { findPublicReplay } = await import("./replay.repository.ts");
  return mapPublicReplay(await findPublicReplay(id, locale));
});

export const deliverPublicReplay = createReplayDelivery({
  async getStorageKey(id) {
    return (await import("./replay.repository.ts")).findPublicReplayStorageKey(id);
  },
  async signObject(key, expiresInSeconds, method) {
    const { env } = await import("../../config/env.ts");
    const storage = env.server.replayStorage;
    if (!storage.accessKey || !storage.secret || !storage.bucket || !storage.region) {
      throw new Error("Private replay delivery is unavailable.");
    }
    const signer = createAwsS3Presigner({
      accessKey: storage.accessKey,
      secret: storage.secret,
      bucket: storage.bucket,
      region: storage.region,
      endpoint: storage.endpoint,
      forcePathStyle: storage.forcePathStyle,
    });
    return method === "HEAD"
      ? signer.signHead(key, expiresInSeconds)
      : signer.signGet(key, expiresInSeconds);
  },
  fetchObject: (input, init) => fetch(input, init),
});
