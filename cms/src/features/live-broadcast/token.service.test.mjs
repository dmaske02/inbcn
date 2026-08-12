import assert from "node:assert/strict";
import test from "node:test";

import { TokenVerifier } from "livekit-server-sdk";
import { createBroadcastTokenService } from "./token.service.ts";

const credentials = {
  apiKey: "test-api-key",
  apiSecret: "test-api-secret-with-sufficient-length",
};

async function claimsFor(token) {
  return new TokenVerifier(credentials.apiKey, credentials.apiSecret).verify(token);
}

test("generateViewerToken creates a subscribe-only room token", async () => {
  const service = createBroadcastTokenService(credentials);

  const claims = await claimsFor(await service.generateViewerToken({
    identity: "viewer-1",
    language: "mr",
    role: "viewer",
  }));

  assert.equal(claims.sub, "viewer-1");
  assert.deepEqual(claims.video, {
    room: "broadcast-mr",
    roomJoin: true,
    canPublish: false,
    canPublishData: false,
    canSubscribe: true,
  });
  assert.equal(claims.attributes?.role, "viewer");
  assert.equal(claims.attributes?.language, "mr");
});

test("generateBroadcasterToken permits media publishing but not room administration", async () => {
  const service = createBroadcastTokenService(credentials);

  const claims = await claimsFor(await service.generateBroadcasterToken({
    identity: "host-1",
    language: "hi",
    role: "broadcaster",
  }));

  assert.equal(claims.sub, "host-1");
  assert.deepEqual(claims.video, {
    room: "broadcast-hi",
    roomJoin: true,
    roomAdmin: false,
    canPublish: true,
    canPublishData: false,
    canSubscribe: true,
  });
  assert.equal(claims.attributes?.role, "broadcaster");
});

test("generateBroadcasterToken gives an admin room moderation permission", async () => {
  const service = createBroadcastTokenService(credentials);

  const claims = await claimsFor(await service.generateBroadcasterToken({
    identity: "admin-1",
    language: "en",
    role: "admin",
  }));

  assert.equal(claims.video?.roomAdmin, true);
  assert.equal(claims.attributes?.role, "admin");
});

test("token methods reject a role that does not match the requested capability", async () => {
  const service = createBroadcastTokenService(credentials);

  await assert.rejects(
    service.generateViewerToken({ identity: "host-1", language: "en", role: "broadcaster" }),
    /viewer/i,
  );
  await assert.rejects(
    service.generateBroadcasterToken({ identity: "viewer-1", language: "en", role: "viewer" }),
    /broadcaster|admin/i,
  );
});
