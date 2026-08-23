import assert from "node:assert/strict";
import test from "node:test";

const secret = "cron-secret-with-at-least-thirty-two-bytes";
process.env.CRON_SECRET = secret;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://reporter-lifecycle.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  return Response.json([]);
};

const route = await import("../../app/api/cron/reporter-lifecycle/route.ts");

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("cron route exports only GET and rejects missing or invalid bearer auth without work", async () => {
  assert.deepEqual(Object.keys(route).filter((name) => /^[A-Z]+$/u.test(name)), ["GET"]);
  assert.equal(route.maxDuration, 60);

  for (const authorization of [undefined, "Bearer wrong", `Basic ${secret}`]) {
    const response = await route.GET(new Request(
      "https://reporter.example.test/api/cron/reporter-lifecycle",
      { headers: authorization ? { authorization } : undefined },
    ));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  }
  assert.equal(requests.length, 0);
});

test("authorized GET is uncached and returns only a bounded safe summary", async () => {
  const response = await route.GET(new Request(
    "https://reporter.example.test/api/cron/reporter-lifecycle?ignored=private",
    { headers: { authorization: `Bearer ${secret}` } },
  ));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  assert.deepEqual(await response.json(), {
    ok: true,
    processed: 0,
    failed: 0,
    capped: false,
    counts: {},
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/rest\/v1\/rpc\/claim_reporter_lifecycle$/u);
});
