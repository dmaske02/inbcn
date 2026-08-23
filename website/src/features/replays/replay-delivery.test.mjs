import assert from "node:assert/strict";
import test from "node:test";

import { createAwsS3Presigner } from "@inbcn/domain/server/aws-s3-presigner";
import { createReplayDelivery } from "./replay.service.ts";

const replayId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const objectKey = `reporter-live/${requestId}/${replayId}.mp4`;

test("the shared signer binds HEAD and GET to different SigV4 signatures", () => {
  const signer = createAwsS3Presigner({
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    bucket: "examplebucket",
    region: "us-east-1",
    forcePathStyle: false,
  });
  const now = new Date("2013-05-24T00:00:00.000Z");

  assert.notEqual(signer.signHead("test.txt", 60, now), signer.signGet("test.txt", 60, now));
});

function delivery(overrides = {}) {
  return createReplayDelivery({
    getStorageKey: async () => objectKey,
    signObject: () => "https://private.example.test/signed?redacted=1",
    fetchObject: async () => new Response("video", {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": "5",
        "accept-ranges": "bytes",
        "x-amz-request-id": "must-not-leak",
      },
    }),
    ...overrides,
  });
}

test("streams a single bounded range while forwarding only safe headers", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("part"));
      controller.close();
    },
  });
  let fetchInit;
  let signed;
  const serve = delivery({
    signObject: (key, expiresIn, method) => {
      signed = { key, expiresIn, method };
      return "https://private.example.test/signed?redacted=1";
    },
    fetchObject: async (_url, init) => {
      fetchInit = init;
      return new Response(stream, {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "4",
          "content-range": "bytes 10-13/100",
          "accept-ranges": "bytes",
          "etag": "private-provider-detail",
          "x-amz-request-id": "private-provider-detail",
        },
      });
    },
  });

  const response = await serve(new Request("https://inbcn.test", {
    headers: { range: "bytes=10-13" },
  }), replayId);

  assert.equal(response.status, 206);
  assert.equal(response.body, stream);
  assert.deepEqual(signed, { key: objectKey, expiresIn: 60, method: "GET" });
  assert.equal(new Headers(fetchInit.headers).get("range"), "bytes=10-13");
  assert.equal(fetchInit.redirect, "error");
  assert.deepEqual(Object.fromEntries(response.headers), {
    "accept-ranges": "bytes",
    "cache-control": "private, no-store, max-age=0",
    "content-length": "4",
    "content-range": "bytes 10-13/100",
    "content-type": "video/mp4",
  });
});

test("HEAD returns metadata without a body and uses a signed HEAD request", async () => {
  let method;
  const serve = delivery({
    signObject: (_key, _expiresIn, signedMethod) => {
      method = signedMethod;
      return "https://private.example.test/signed?redacted=1";
    },
    fetchObject: async (_url, init) => {
      assert.equal(init.method, "HEAD");
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "100" },
      });
    },
  });

  const response = await serve(new Request("https://inbcn.test", { method: "HEAD" }), replayId);

  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("content-length"), "100");
  assert.equal(method, "HEAD");
});

test("ranged HEAD accepts S3's 200 metadata response without Content-Range", async () => {
  let fetchInit;
  const serve = delivery({
    fetchObject: async (_url, init) => {
      fetchInit = init;
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "10",
          "x-amz-request-id": "must-not-leak",
        },
      });
    },
  });

  const response = await serve(new Request("https://inbcn.test", {
    method: "HEAD",
    headers: { range: "bytes=10-19" },
  }), replayId);

  assert.equal(fetchInit.method, "HEAD");
  assert.equal(new Headers(fetchInit.headers).get("range"), "bytes=10-19");
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.deepEqual(Object.fromEntries(response.headers), {
    "accept-ranges": "bytes",
    "cache-control": "private, no-store, max-age=0",
    "content-length": "10",
    "content-type": "video/mp4",
  });
});

test("rejects malformed, multiple, and suffix ranges before signing or fetching", async () => {
  for (const range of ["bytes=10-20,30-40", "bytes=-500", "items=0-1", "bytes=20-10", "bytes=1 - 2"]) {
    let called = false;
    const serve = delivery({
      getStorageKey: async () => { called = true; return objectKey; },
      fetchObject: async () => { called = true; throw new Error("not reached"); },
    });
    const response = await serve(new Request("https://inbcn.test", { headers: { range } }), replayId);
    assert.equal(response.status, 416, range);
    assert.equal(await response.text(), "Range not satisfiable.");
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(called, false);
  }
});

test("returns fixed not-found and provider-failure responses without leaking details", async () => {
  const missing = await delivery({ getStorageKey: async () => null })(
    new Request("https://inbcn.test"), replayId,
  );
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "Replay not found.");

  const unavailable = await delivery({
    fetchObject: async () => new Response("SECRET provider body", {
      status: 403,
      headers: { "x-provider-error": "SECRET" },
    }),
  })(new Request("https://inbcn.test"), replayId);
  assert.equal(unavailable.status, 503);
  assert.equal(await unavailable.text(), "Replay unavailable.");
  assert.equal(unavailable.headers.has("x-provider-error"), false);
});

test("maps an upstream unsatisfied range to a fixed redacted 416", async () => {
  const response = await delivery({
    fetchObject: async () => new Response("SECRET provider range detail", {
      status: 416,
      headers: { "content-range": "bytes */100", "x-provider-error": "SECRET" },
    }),
  })(new Request("https://inbcn.test", { headers: { range: "bytes=100-" } }), replayId);

  assert.equal(response.status, 416);
  assert.equal(await response.text(), "Range not satisfiable.");
  assert.equal(response.headers.has("content-range"), false);
  assert.equal(response.headers.has("x-provider-error"), false);
});

test("rejects non-canonical identifiers before the privileged lookup", async () => {
  let called = false;
  const response = await delivery({
    getStorageKey: async () => { called = true; return objectKey; },
  })(new Request("https://inbcn.test"), "11111111-1111-4111-8111-111111111111?unsafe=1");
  assert.equal(response.status, 404);
  assert.equal(called, false);
});
