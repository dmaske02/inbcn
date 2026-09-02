import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  UploadClientError,
  cloudinaryUploadChunks,
  createBrowserUpload,
  isUploadBusy,
  isSignedUploadFresh,
  validateProviderAsset,
  validateUpload,
  validateUploadMetadata,
} from "./upload.model.ts";
import {
  UploadServiceError,
  createUploadService,
} from "./upload.service.ts";
import { createCloudinaryUploadProvider } from "./cloudinary-signature.server.ts";
import {
  MAX_UPLOAD_ROUTE_BODY_BYTES,
  createUploadRouteHandler,
} from "./upload.routes.ts";

const imageCases = [
  ["photo.jpg", "image/jpeg"],
  ["photo.jpeg", "image/jpeg"],
  ["photo.png", "image/png"],
  ["photo.webp", "image/webp"],
  ["photo.avif", "image/avif"],
];

const videoCases = [
  ["clip.mp4", "video/mp4"],
  ["clip.webm", "video/webm"],
];

test("accepts each exact image and video allowlist entry at its byte cap", () => {
  for (const [filename, mimeType] of imageCases) {
    assert.equal(validateUpload({ filename, mediaType: "image", mimeType, bytes: MAX_IMAGE_UPLOAD_BYTES }).ok, true);
  }
  for (const [filename, mimeType] of videoCases) {
    assert.equal(validateUpload({ filename, mediaType: "video", mimeType, bytes: MAX_VIDEO_UPLOAD_BYTES }).ok, true);
  }
});

test("rejects non-positive, fractional, and oversized byte counts", () => {
  for (const bytes of [0, -1, 1.5, Number.NaN, MAX_IMAGE_UPLOAD_BYTES + 1]) {
    assert.equal(validateUpload({ filename: "photo.jpg", mediaType: "image", mimeType: "image/jpeg", bytes }).ok, false);
  }
  assert.equal(validateUpload({
    filename: "clip.mp4",
    mediaType: "video",
    mimeType: "video/mp4",
    bytes: MAX_VIDEO_UPLOAD_BYTES + 1,
  }).ok, false);
});

test("rejects every unlisted type, MIME, extension, and mismatch", () => {
  for (const input of [
    { filename: "report.pdf", mediaType: "document", mimeType: "application/pdf", bytes: 20 },
    { filename: "photo.gif", mediaType: "image", mimeType: "image/gif", bytes: 20 },
    { filename: "photo.jpg", mediaType: "video", mimeType: "image/jpeg", bytes: 20 },
    { filename: "photo.png", mediaType: "image", mimeType: "image/jpeg", bytes: 20 },
    { filename: "clip.mp4.exe", mediaType: "video", mimeType: "video/mp4", bytes: 20 },
  ]) {
    assert.equal(validateUpload(input).ok, false);
  }
});

test("normalizes bounded accessibility metadata and requires image alt text", () => {
  assert.deepEqual(validateUploadMetadata({
    mediaType: "image",
    title: "  Flooded road  ",
    originalFilename: "  road.jpg  ",
    altText: "  Water covering the road  ",
  }), {
    ok: true,
    data: {
      title: "Flooded road",
      originalFilename: "road.jpg",
      altText: "Water covering the road",
    },
  });
  assert.equal(validateUploadMetadata({
    mediaType: "image",
    title: "Photo",
    originalFilename: "photo.jpg",
    altText: " ",
  }).ok, false);
  assert.deepEqual(validateUploadMetadata({
    mediaType: "video",
    title: "Clip",
    originalFilename: "clip.mp4",
    altText: " ",
  }), { ok: true, data: { title: "Clip", originalFilename: "clip.mp4", altText: null } });
  for (const input of [
    { mediaType: "image", title: " ", originalFilename: "photo.jpg", altText: "Alt" },
    { mediaType: "image", title: "x".repeat(201), originalFilename: "photo.jpg", altText: "Alt" },
    { mediaType: "image", title: "Photo", originalFilename: "x".repeat(256), altText: "Alt" },
    { mediaType: "image", title: "Photo", originalFilename: "photo.jpg", altText: "x".repeat(501) },
  ]) assert.equal(validateUploadMetadata(input).ok, false);
});

const imageAsset = {
  asset_id: "asset-image-1",
  public_id: "inbcn/reporter/story/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333",
  resource_type: "image",
  type: "upload",
  format: "jpg",
  bytes: 1_000_000,
  width: 1200,
  height: 800,
  secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1787461170/inbcn/reporter/story/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg",
  created_at: "2026-08-23T10:19:30.000Z",
};

const providerExpectation = {
  assetId: imageAsset.asset_id,
  publicId: imageAsset.public_id,
  mediaType: "image",
  originalFilename: "road.jpeg",
  cloudName: "demo-cloud",
  signedAt: 1_787_480_340,
};

test("accepts authoritative provider image and video facts", () => {
  const image = validateProviderAsset(imageAsset, providerExpectation, "2026-08-23T10:20:00.000Z");
  assert.equal(image.ok, true);
  if (image.ok) assert.deepEqual(image.data, {
    assetId: imageAsset.asset_id,
    publicId: imageAsset.public_id,
    mediaType: "image",
    deliveryType: "upload",
    format: "jpg",
    mimeType: "image/jpeg",
    bytes: 1_000_000,
    width: 1200,
    height: 800,
    durationSeconds: null,
    secureUrl: imageAsset.secure_url,
    createdAt: imageAsset.created_at,
  });

  const video = validateProviderAsset({
    ...imageAsset,
    asset_id: "asset-video-1",
    public_id: imageAsset.public_id.replace(/3333-4333-8333-333333333333$/u, "4444-4444-8444-444444444444"),
    resource_type: "video",
    format: "webm",
    bytes: MAX_VIDEO_UPLOAD_BYTES,
    duration: 12.25,
    width: 1920,
    height: 1080,
    secure_url: imageAsset.secure_url
      .replace("/image/", "/video/")
      .replace(/3333-4333-8333-333333333333[.]jpg$/u, "4444-4444-8444-444444444444.webm"),
  }, {
    ...providerExpectation,
    assetId: "asset-video-1",
    publicId: imageAsset.public_id.replace(/3333-4333-8333-333333333333$/u, "4444-4444-8444-444444444444"),
    mediaType: "video",
    originalFilename: "clip.webm",
  }, "2026-08-23T10:20:00.000Z");
  assert.equal(video.ok, true);
});

test("rejects forged or incomplete authoritative provider facts", () => {
  for (const patch of [
    { asset_id: "wrong-asset" },
    { public_id: `${imageAsset.public_id}-forged` },
    { resource_type: "video" },
    { type: "authenticated" },
    { format: "gif" },
    { bytes: 0 },
    { bytes: MAX_IMAGE_UPLOAD_BYTES + 1 },
    { width: undefined },
    { height: undefined },
    { secure_url: imageAsset.secure_url.replace("res.cloudinary.com", "evil.example") },
    { secure_url: imageAsset.secure_url.replace("/demo-cloud/", "/other-cloud/") },
    { created_at: "2026-08-23T10:17:00.000Z" },
    { created_at: "2026-08-23T10:26:00.000Z" },
  ]) {
    assert.equal(validateProviderAsset({ ...imageAsset, ...patch }, providerExpectation, "2026-08-23T10:20:00.000Z").ok, false);
  }
  assert.equal(validateProviderAsset({
    ...imageAsset,
    asset_id: "asset-video-1",
    resource_type: "video",
    format: "mp4",
    secure_url: imageAsset.secure_url.replace("/image/", "/video/").replace(/[.]jpg$/u, ".mp4"),
  }, {
    ...providerExpectation,
    assetId: "asset-video-1",
    mediaType: "video",
    originalFilename: "clip.mp4",
  }, "2026-08-23T10:20:00.000Z").ok, false);
});

test("accepts omitted or active status and rejects explicit non-active or malformed status", () => {
  assert.equal(validateProviderAsset({
    ...imageAsset,
    status: "active",
    placeholder: false,
  }, providerExpectation, "2026-08-23T10:20:00.000Z").ok, true);

  for (const patch of [
    { status: "deleted" },
    { status: "not_found" },
    { status: undefined },
    { status: null },
    { status: false },
    { status: 1 },
    { placeholder: true },
  ]) {
    assert.equal(validateProviderAsset(
      { ...imageAsset, ...patch },
      providerExpectation,
      "2026-08-23T10:20:00.000Z",
    ).ok, false);
  }
});

test("rejects an asset created beyond the signed upload validity window", () => {
  assert.equal(validateProviderAsset({
    ...imageAsset,
    created_at: new Date((providerExpectation.signedAt + 2 * 60 * 60) * 1_000).toISOString(),
  }, providerExpectation, new Date((providerExpectation.signedAt + 3 * 60 * 60) * 1_000).toISOString()).ok, false);
});

test("uses Cloudinary's one-hour signing lifetime without claiming a shorter TTL", () => {
  const signedAt = 1_787_480_340;
  assert.equal(isSignedUploadFresh(signedAt, signedAt + 3_599), true);
  assert.equal(isSignedUploadFresh(signedAt, signedAt + 3_600), false);
  assert.equal(isSignedUploadFresh(signedAt, signedAt - 301), false);
});

const profileId = "11111111-1111-4111-8111-111111111111";
const storyId = "22222222-2222-4222-8222-222222222222";
const randomId = "33333333-3333-4333-8333-333333333333";
const publicId = `inbcn/reporter/story/${storyId}/${randomId}`;
const now = "2026-08-23T10:20:00.000Z";
const signedAt = 1_787_480_340;

const activeAccess = {
  jwtUserId: profileId,
  jwtRole: "reporter",
  jwtAccessGeneration: 7,
  profileId,
  profileRole: "reporter",
  profileActive: true,
  reporterProfileId: profileId,
  accessSyncStatus: "succeeded",
  accessSyncDesiredRole: "reporter",
  accessSyncGeneration: 7,
  publicStatus: "active",
  membershipStartedAt: "2026-01-01T00:00:00.000Z",
  membershipExpiresAt: "2026-12-31T23:59:59.000Z",
  membershipGraceEndsAt: "2027-01-07T23:59:59.000Z",
  storyId,
  storyCreatedBy: profileId,
  isReporterStory: true,
  storyStatus: "draft",
  storySourceId: null,
};

function uploadService(overrides = {}) {
  const calls = { signed: [], lookedUp: [], completed: [] };
  const repository = {
    getAccess: async () => activeAccess,
    complete: async (input) => { calls.completed.push(input); return { id: "55555555-5555-4555-8555-555555555555" }; },
    ...overrides.repository,
  };
  const provider = {
    sign: (input) => {
      calls.signed.push(input);
      return {
        cloudName: "demo-cloud",
        apiKey: "public-api-key",
        timestamp: input.timestamp,
        signature: "a".repeat(40),
        resourceType: input.mediaType,
        uploadUrl: `https://api.cloudinary.com/v1_1/demo-cloud/${input.mediaType}/upload`,
        publicId: input.publicId,
        signedParameters: {
          public_id: input.publicId,
          type: "upload",
          overwrite: false,
          allowed_formats: input.mediaType === "image" ? ["jpg", "jpeg", "png", "webp", "avif"] : ["mp4", "webm"],
        },
      };
    },
    verify: (input) => input.signature === "a".repeat(40) && input.publicId === publicId,
    getAsset: async (assetId) => { calls.lookedUp.push(assetId); return imageAsset; },
    getCloudName: () => "demo-cloud",
    ...overrides.provider,
  };
  return {
    calls,
    service: createUploadService({
      repository,
      provider,
      now: () => new Date(now),
      randomId: () => randomId,
    }),
  };
}

test("signs only a server-owned non-guessable public ID after current access checks", async () => {
  const { calls, service } = uploadService();
  const result = await service.requestSignedUpload(profileId, {
    storyId,
    mediaType: "image",
    filename: "road.jpg",
    bytes: 1_000_000,
    mimeType: "image/jpeg",
  });

  assert.equal(result.publicId, publicId);
  assert.equal(result.publicId.includes(profileId), false);
  assert.equal(result.resourceType, "image");
  assert.equal(result.timestamp, Math.floor(Date.parse(now) / 1_000));
  assert.deepEqual(calls.signed, [{ publicId, mediaType: "image", timestamp: Math.floor(Date.parse(now) / 1_000) }]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal("folder" in result.signedParameters, false);
});

test("rejects non-object service payloads as safe invalid uploads", async () => {
  const { service } = uploadService();
  await assert.rejects(
    service.requestSignedUpload(profileId, null),
    (error) => error instanceof UploadServiceError && error.code === "invalid-upload",
  );
  await assert.rejects(
    service.completeSignedUpload(profileId, "not-an-object"),
    (error) => error instanceof UploadServiceError && error.code === "invalid-upload",
  );
});

test("denies wrong ownership, legacy citizen reports, non-drafts, inactive membership, and stale generation", async () => {
  const denied = [
    { storyCreatedBy: "99999999-9999-4999-8999-999999999999" },
    { isReporterStory: false },
    { storyStatus: "pending_review" },
    { storySourceId: "99999999-9999-4999-8999-999999999999" },
    { membershipExpiresAt: "2026-01-02T00:00:00.000Z", membershipGraceEndsAt: "2026-01-09T00:00:00.000Z" },
    { publicStatus: "suspended" },
    { profileActive: false },
    { accessSyncStatus: "pending" },
    { accessSyncGeneration: 8 },
  ];
  for (const patch of denied) {
    const { calls, service } = uploadService({
      repository: { getAccess: async () => ({ ...activeAccess, ...patch }) },
    });
    await assert.rejects(
      service.requestSignedUpload(profileId, {
        storyId,
        mediaType: "image",
        filename: "road.jpg",
        bytes: 1_000,
        mimeType: "image/jpeg",
      }),
      (error) => error instanceof UploadServiceError && error.code === "forbidden",
    );
    assert.equal(calls.signed.length, 0);
  }
});

test("allows current grace membership to upload for review", async () => {
  const { service } = uploadService({
    repository: {
      getAccess: async () => ({
        ...activeAccess,
        publicStatus: "grace",
        membershipExpiresAt: "2026-08-22T10:20:00.000Z",
        membershipGraceEndsAt: "2026-08-29T10:20:00.000Z",
      }),
    },
  });
  assert.equal((await service.requestSignedUpload(profileId, {
    storyId,
    mediaType: "video",
    filename: "clip.mp4",
    bytes: 1_000,
    mimeType: "video/mp4",
  })).resourceType, "video");
});

const completion = {
  storyId,
  assetId: imageAsset.asset_id,
  publicId,
  mediaType: "image",
  timestamp: signedAt,
  signature: "a".repeat(40),
  title: "Road flooding",
  originalFilename: "road.jpeg",
  altText: "Water covering the road",
};

test("completes only after signature and authoritative asset verification", async () => {
  const { calls, service } = uploadService();
  const result = await service.completeSignedUpload(profileId, completion);

  assert.deepEqual(result, { id: "55555555-5555-4555-8555-555555555555" });
  assert.deepEqual(calls.lookedUp, [imageAsset.asset_id]);
  assert.equal(calls.completed.length, 1);
  assert.deepEqual(calls.completed[0], {
    profileId,
    accessGeneration: 7,
    storyId,
    metadata: {
      title: "Road flooding",
      originalFilename: "road.jpeg",
      altText: "Water covering the road",
    },
    asset: {
      assetId: imageAsset.asset_id,
      publicId,
      mediaType: "image",
      deliveryType: "upload",
      format: "jpg",
      mimeType: "image/jpeg",
      bytes: 1_000_000,
      width: 1200,
      height: 800,
      durationSeconds: null,
      secureUrl: imageAsset.secure_url,
      createdAt: imageAsset.created_at,
    },
  });
});

test("rejects forged authorization and public IDs before provider lookup", async () => {
  for (const patch of [
    { signature: "b".repeat(40) },
    { publicId: publicId.replace(randomId, "44444444-4444-4444-8444-444444444444") },
    { publicId: publicId.replace(storyId, "44444444-4444-4444-8444-444444444444") },
    { publicId: `inbcn/reporter/story/${profileId}/${storyId}/${randomId}` },
  ]) {
    const { calls, service } = uploadService();
    await assert.rejects(
      service.completeSignedUpload(profileId, { ...completion, ...patch }),
      (error) => error instanceof UploadServiceError && error.code === "invalid-upload",
    );
    assert.equal(calls.lookedUp.length, 0);
    assert.equal(calls.completed.length, 0);
  }
});

test("keeps provider failures safe and completion retryable", async () => {
  const { service } = uploadService({
    provider: { getAsset: async () => { throw new Error("api_secret=do-not-leak"); } },
  });
  await assert.rejects(
    service.completeSignedUpload(profileId, completion),
    (error) => error instanceof UploadServiceError
      && error.code === "temporarily-unavailable"
      && !error.message.includes("api_secret"),
  );
});

test("Cloudinary signing covers only server-fixed upload parameters and exposes no secret", async () => {
  const signatureInputs = [];
  const fetched = [];
  const provider = createCloudinaryUploadProvider({
    cloudName: "demo-cloud",
    apiKey: "public-api-key",
    apiSecret: "private-api-secret",
    signRequest(parameters, secret) {
      signatureInputs.push({ parameters, secret });
      return createHash("sha1").update(`${JSON.stringify(parameters)}:${secret}`).digest("hex");
    },
    async fetchAsset(assetId) {
      fetched.push(assetId);
      return imageAsset;
    },
  });

  const signed = provider.sign({ publicId, mediaType: "image", timestamp: signedAt });
  assert.deepEqual(signatureInputs[0].parameters, {
    timestamp: signedAt,
    public_id: publicId,
    type: "upload",
    overwrite: false,
    allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
  });
  assert.equal(signed.cloudName, "demo-cloud");
  assert.equal(signed.apiKey, "public-api-key");
  assert.equal(signed.uploadUrl, "https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
  assert.equal(JSON.stringify(signed).includes("private-api-secret"), false);
  assert.equal(provider.verify({
    publicId,
    mediaType: "image",
    timestamp: signedAt,
    signature: signed.signature,
  }), true);
  assert.equal(provider.verify({
    publicId: `${publicId}-forged`,
    mediaType: "image",
    timestamp: signedAt,
    signature: signed.signature,
  }), false);
  assert.equal(await provider.getAsset(imageAsset.asset_id), imageAsset);
  assert.deepEqual(fetched, [imageAsset.asset_id]);
});

test("canonical completion serializes concurrent public and asset ID conflicts service-only", async () => {
  const migrationUrl = new URL("../../../../supabase/migrations/20260822156000_public_media_and_reporter_path_hardening.sql", import.meta.url);
  const initialMigrationUrl = new URL("../../../../supabase/migrations/20260822152000_reporter_media_completion.sql", import.meta.url);
  const [sql, initialSql] = await Promise.all([
    readFile(migrationUrl, "utf8").catch(() => ""),
    readFile(initialMigrationUrl, "utf8"),
  ]);
  const compact = sql.replace(/\s+/gu, " ");
  const compactInitial = initialSql.replace(/\s+/gu, " ");
  const completionFunction = compact.match(
    /create or replace function public\.complete_reporter_media_upload\([\s\S]+?\$\$;/u,
  )?.[0] ?? "";
  const databaseTypes = await readFile(new URL("../../../../packages/database/src/database.types.ts", import.meta.url), "utf8");

  assert.match(compact, /create or replace function public\.complete_reporter_media_upload\(/u);
  assert.match(compact, /security definer set search_path = ''/u);
  assert.match(compact, /from public\.reporter_profiles where profile_id = p_profile_id for update;[\s\S]*from public\.profiles where id = p_profile_id for update;[\s\S]*from public\.stories where id = p_story_id for update;/u);
  assert.match(compact, /access_sync_generation is distinct from p_access_generation/u);
  assert.match(compact, /is_reporter_story\(current_story\)[\s\S]*status is distinct from 'draft'[\s\S]*source_id is not null/u);
  assert.match(compactInitial, /create unique index media_cloudinary_asset_id_key on public\.media \(\(metadata ->> 'cloudinaryAssetId'\)\)/u);
  assert.match(compact, /insert into public\.media \([\s\S]*story_id[\s\S]*\) values \([\s\S]*null,[\s\S]*on conflict do nothing/u);
  assert.match(compact, /metadata ->> 'cloudinaryAssetId'[\s\S]*metadata ->> 'reporterStoryId'/u);
  assert.match(compact, /'uploadedBy', p_profile_id/u);
  assert.match(compact, /existing_media\.created_by is distinct from p_profile_id/u);
  assert.match(completionFunction, /'inbcn\/reporter\/story\/' \|\| p_story_id::text \|\| '\/' \|\| object_id/u);
  assert.doesNotMatch(completionFunction, /'inbcn\/reporter\/story\/' \|\| p_profile_id::text/u);
  assert.match(compact, /where cloudinary_public_id = p_public_id for update;/u);
  assert.match(compact, /message = 'REPORTER_MEDIA_CONFLICT'/u);
  assert.match(compact, /revoke all on function public\.complete_reporter_media_upload\([\s\S]*from public, anon, authenticated, service_role;/u);
  assert.match(compact, /grant execute on function public\.complete_reporter_media_upload\([\s\S]*to service_role;/u);
  assert.doesNotMatch(compact, /grant execute on function public\.complete_reporter_media_upload\([\s\S]*to authenticated;/u);
  assert.match(compact, /media_reporter_upload_binding_check/u);
  assert.match(compact, /metadata ->> 'uploadedBy'\) = created_by::text/u);
  assert.match(compact, /cloudinary_public_id = 'inbcn\/reporter\/story\/' \|\| created_by::text \|\| '\/' \|\| \(metadata ->> 'reporterStoryId'\) \|\| '\/' \|\| \(metadata ->> 'cloudinaryObjectId'\)/u);
  assert.doesNotMatch(compact, /set story_id = p_story_id|sort_order =/u);
  assert.match(databaseTypes, /complete_reporter_media_upload:[\s\S]*p_access_generation: number[\s\S]*p_provider_created_at: string[\s\S]*Returns: string/u);
});

test("reporters have no direct canonical media mutation policy bypass", async () => {
  const directory = new URL("../../../../supabase/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
  const migrations = (await Promise.all(names.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  const mediaPolicies = migrations.match(/create policy [^;]+on public\.media[^;]+;/giu) ?? [];
  assert.equal(mediaPolicies.some((policy) => /reporter/iu.test(policy)
    && /for (?:insert|update|delete|all)/iu.test(policy)), false);
});

test("upload routes authenticate independently and cap bodies before reading them", async () => {
  let signed = false;
  let completed = false;
  const unauthorized = createUploadRouteHandler({
    authorize: async () => ({ ok: false, reason: "unauthenticated" }),
    execute: async () => { signed = true; },
  });
  const unauthorizedResponse = await unauthorized({
    headers: new Headers(),
    get body() { throw new Error("unauthorized body must not be read"); },
  });
  assert.equal(unauthorizedResponse.status, 401);

  const oversized = createUploadRouteHandler({
    authorize: async () => ({ ok: true, state: "reporter", userId: profileId }),
    execute: async () => { completed = true; },
  });
  const oversizedResponse = await oversized({
    headers: new Headers({ "content-length": String(MAX_UPLOAD_ROUTE_BODY_BYTES + 1) }),
    get body() { throw new Error("oversized body must not be read"); },
  });
  assert.equal(oversizedResponse.status, 413);
  assert.equal(signed, false);
  assert.equal(completed, false);

  const undeclaredOversized = await createUploadRouteHandler({
    authorize: async () => ({ ok: true, state: "reporter", userId: profileId }),
    execute: async () => { signed = true; },
  })(new Request("https://example.test/api/uploads/sign", {
    method: "POST",
    body: "x".repeat(MAX_UPLOAD_ROUTE_BODY_BYTES + 1),
  }));
  assert.equal(undeclaredOversized.status, 413);
  assert.equal(signed, false);
});

test("upload routes parse bounded JSON and return only safe service errors", async () => {
  const signed = createUploadRouteHandler({
    authorize: async () => ({ ok: true, state: "reporter", userId: profileId }),
    execute: async (actorId, input) => ({ actorId, input }),
  });
  const good = await signed(new Request("https://example.test/api/uploads/sign", {
    method: "POST",
    body: JSON.stringify({ storyId, mediaType: "image", filename: "road.jpg", bytes: 20, mimeType: "image/jpeg" }),
  }));
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), {
    actorId: profileId,
    input: { storyId, mediaType: "image", filename: "road.jpg", bytes: 20, mimeType: "image/jpeg" },
  });

  const malformed = await signed(new Request("https://example.test/api/uploads/sign", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);

  for (const [code, status] of [
    ["invalid-upload", 400],
    ["forbidden", 403],
    ["conflict", 409],
    ["temporarily-unavailable", 503],
  ]) {
    const handler = createUploadRouteHandler({
      authorize: async () => ({ ok: true, state: "reporter", userId: profileId }),
      execute: async () => { throw new UploadServiceError(code, "api_secret=do-not-leak"); },
    });
    const response = await handler(new Request("https://example.test/api/uploads/complete", {
      method: "POST",
      body: JSON.stringify(completion),
    }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code });
  }
});

const browserAuthorization = {
  cloudName: "demo-cloud",
  apiKey: "public-api-key",
  timestamp: signedAt,
  signature: "a".repeat(40),
  resourceType: "video",
  uploadUrl: "https://api.cloudinary.com/v1_1/demo-cloud/video/upload",
  publicId,
  signedParameters: {
    public_id: publicId,
    type: "upload",
    overwrite: false,
    allowed_formats: ["mp4", "webm"],
  },
};

test("plans direct uploads through 100 MiB and 20 MiB chunks above it", () => {
  assert.deepEqual(cloudinaryUploadChunks(100 * 1024 * 1024), [{ start: 0, end: 100 * 1024 * 1024 }]);
  const chunks = cloudinaryUploadChunks(MAX_VIDEO_UPLOAD_BYTES);
  assert.equal(chunks.length, 13);
  assert.deepEqual(chunks[0], { start: 0, end: 20 * 1024 * 1024 });
  assert.deepEqual(chunks.at(-1), { start: 240 * 1024 * 1024, end: MAX_VIDEO_UPLOAD_BYTES });
});

function fakeFile(size) {
  return {
    name: "field-report.mp4",
    size,
    type: "video/mp4",
    slice: () => new Blob(["chunk"], { type: "video/mp4" }),
  };
}

function respondingRequests() {
  const requests = [];
  return {
    requests,
    createRequest() {
      const headers = {};
      const request = {
        upload: {},
        status: 0,
        responseText: "",
        open(method, url) { this.method = method; this.url = url; },
        setRequestHeader(name, value) { headers[name] = value; },
        send(body) {
          this.body = body;
          requests.push({ request: this, headers });
          queueMicrotask(() => {
            this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 });
            const range = headers["Content-Range"];
            const final = !range || Number(range.match(/-(\d+)\//u)?.[1]) === MAX_VIDEO_UPLOAD_BYTES - 1;
            this.status = 200;
            this.responseText = JSON.stringify(final ? { done: true, asset_id: "asset-video-1" } : { done: false });
            this.onload?.();
          });
        },
        abort() { this.onabort?.(); },
      };
      return request;
    },
  };
}

test("uses browser crypto with its required receiver when no upload ID is injected", async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const browserCrypto = {
    randomUUID() {
      if (this !== browserCrypto) throw new TypeError("Illegal invocation");
      return "browser-generated-upload-id";
    },
  };
  const fake = respondingRequests();
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: browserCrypto });
  try {
    const transfer = createBrowserUpload(fakeFile(MAX_VIDEO_UPLOAD_BYTES), browserAuthorization, {
      createRequest: () => fake.createRequest(),
    });
    assert.deepEqual(await transfer.promise, { assetId: "asset-video-1" });
    assert.equal(fake.requests[0].headers["X-Unique-Upload-Id"], "browser-generated-upload-id");
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  }
});

test("uploads a 250 MiB file directly in Cloudinary-supported chunks with aggregate progress", async () => {
  const fake = respondingRequests();
  const progress = [];
  const transfer = createBrowserUpload(fakeFile(MAX_VIDEO_UPLOAD_BYTES), browserAuthorization, {
    createRequest: () => fake.createRequest(),
    uploadId: () => "chunk-upload-id",
    onProgress: (value) => progress.push(value),
  });

  assert.deepEqual(await transfer.promise, { assetId: "asset-video-1" });
  assert.equal(fake.requests.length, 13);
  assert.equal(fake.requests.every(({ headers }) => headers["X-Unique-Upload-Id"] === "chunk-upload-id"), true);
  assert.equal(fake.requests[0].headers["Content-Range"], `bytes 0-${20 * 1024 * 1024 - 1}/${MAX_VIDEO_UPLOAD_BYTES}`);
  assert.equal(fake.requests.at(-1).headers["Content-Range"], `bytes ${240 * 1024 * 1024}-${MAX_VIDEO_UPLOAD_BYTES - 1}/${MAX_VIDEO_UPLOAD_BYTES}`);
  assert.equal(fake.requests[0].request.body.get("api_key"), "public-api-key");
  assert.equal(fake.requests[0].request.body.get("public_id"), publicId);
  assert.equal(fake.requests[0].request.body.get("overwrite"), "false");
  assert.equal(progress.at(-1), 100);
});

test("cancellation aborts the active request and the same selected file can retry", async () => {
  let activeRequest;
  const file = fakeFile(1_000);
  const cancelled = createBrowserUpload(file, { ...browserAuthorization, resourceType: "video" }, {
    createRequest: () => {
      activeRequest = {
        upload: {},
        open() {},
        setRequestHeader() {},
        send() {},
        abort() { this.onabort?.(); },
      };
      return activeRequest;
    },
    uploadId: () => "cancelled-upload-id",
  });
  cancelled.cancel();
  await assert.rejects(cancelled.promise, (error) => error instanceof UploadClientError && error.code === "cancelled");

  const retry = respondingRequests();
  const completed = createBrowserUpload(file, browserAuthorization, {
    createRequest: () => retry.createRequest(),
    uploadId: () => "retry-upload-id",
  });
  assert.deepEqual(await completed.promise, { assetId: "asset-video-1" });
  assert.equal(retry.requests.length, 1);
  assert.equal(retry.requests[0].headers["Content-Range"], undefined);
});

test("media uploader announces progress and retries pending completion without losing the file", async () => {
  const component = await readFile(new URL("../submissions/media-uploader.tsx", import.meta.url), "utf8").catch(() => "");
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /Cancel upload/u);
  assert.match(component, /Retry/u);
  assert.match(component, /isSignedUploadFresh/u);
  assert.match(component, /pendingCompletion/u);
  assert.match(component, /createBrowserUpload/u);
  assert.match(component, /\/api\/uploads\/sign/u);
  assert.match(component, /\/api\/uploads\/complete/u);
  const failedUpload = component.slice(component.indexOf("} catch (error)"), component.indexOf("return ("));
  assert.doesNotMatch(failedUpload, /setFile\(null\)/u);
});

test("media uploader queues multiple selections and uploads each file independently", async () => {
  const component = await readFile(new URL("../submissions/media-uploader.tsx", import.meta.url), "utf8").catch(() => "");
  assert.match(component, /type="file"[\s\S]*?multiple/u);
  assert.match(component, /Array\.from\(event\.target\.files/u);
  assert.match(component, /QueuedUpload/u);
  assert.match(component, /pendingUploads[\s\S]*for \(const uploadId of pendingUploads/u);
  assert.match(component, /onUploaded\?\.\(\{ id: mediaId, title: metadata\.data\.title, type: upload\.mediaType \}\)/u);
});

test("media uploader keeps per-file metadata and retries only the requested failed item", async () => {
  const component = await readFile(new URL("../submissions/media-uploader.tsx", import.meta.url), "utf8").catch(() => "");
  assert.match(component, /uploads\.map\(\(upload\)/u);
  assert.match(component, /updateUpload\(upload\.id, \{ title:/u);
  assert.match(component, /updateUpload\(upload\.id, \{ altText:/u);
  assert.match(component, /uploadOne\(upload\.id\)/u);
  assert.match(component, /upload\.phase === "error"/u);
  assert.match(component, /upload\.phase === "complete"/u);
  assert.match(component, /pendingCompletion/u);
});

test("media uploader reports the whole queue pending until every item completes or is removed", async () => {
  const component = await readFile(new URL("../submissions/media-uploader.tsx", import.meta.url), "utf8").catch(() => "");
  assert.match(component, /uploads\.some\(\(upload\) => upload\.phase !== "complete"\)/u);
  assert.match(component, /onPendingChange\?\.\(hasIncompleteUploads\)/u);
  assert.match(component, /filter\(\(upload\) => upload\.id !== uploadId\)/u);
});

test("media uploader prevents overlapping batch loops before React updates the busy state", async () => {
  const component = await readFile(new URL("../submissions/media-uploader.tsx", import.meta.url), "utf8").catch(() => "");
  assert.match(component, /const batchRunning = useRef\(false\)/u);
  assert.match(component, /if \(batchRunning\.current\) return/u);
  assert.match(component, /batchRunning\.current = true/u);
  assert.match(component, /finally \{ batchRunning\.current = false; \}/u);
});

test("busy uploader state disables every mutable control", async () => {
  for (const phase of ["signing", "uploading", "completing"]) {
    assert.equal(isUploadBusy(phase), true);
  }
  for (const phase of ["idle", "error", "complete"]) {
    assert.equal(isUploadBusy(phase), false);
  }

  const component = await readFile(new URL("../submissions/media-uploader.tsx", import.meta.url), "utf8").catch(() => "");
  assert.match(component, /const busy = uploads\.some\(\(upload\) => isUploadBusy\(upload\.phase\)\)/u);
  assert.match(component, /id="story-media-file"[\s\S]*?disabled=\{busy\}[\s\S]*?\/>/u);
  assert.match(component, /story-media-title-\$\{upload\.id\}[\s\S]*?disabled=\{busy \|\| upload\.phase === "complete"\}/u);
  assert.match(component, /story-media-alt-\$\{upload\.id\}[\s\S]*?disabled=\{busy \|\| upload\.phase === "complete"\}/u);
});
