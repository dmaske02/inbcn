import assert from "node:assert/strict";
import test from "node:test";

async function model() {
  const value = await import("./breaking-alerts.model.ts").catch(() => null);
  assert.ok(value, "breaking alert model should exist");
  return value;
}

const base = {
  id: "alert-1", title: "Flood warning", message: "Avoid low-lying roads.",
  type: "alert", placement: "pinned_banner", status: "active", isActive: true,
  priority: 50, targetScope: "global", languageCode: "en", categorySlug: null,
  storySlug: null, backgroundColor: "#FFF4D6", textColor: "#241A00",
  dismissible: true, startAt: "2026-08-03T10:00:00.000Z", endAt: null,
};

test("visibility excludes future, expired, inactive, and archived alerts", async () => {
  const { isAlertVisible } = await model();
  const now = new Date("2026-08-03T12:00:00.000Z");
  assert.equal(isAlertVisible(base, now), true);
  assert.equal(isAlertVisible({ ...base, startAt: "2026-08-03T13:00:00.000Z" }, now), false);
  assert.equal(isAlertVisible({ ...base, endAt: "2026-08-03T11:59:59.000Z" }, now), false);
  assert.equal(isAlertVisible({ ...base, isActive: false }, now), false);
  assert.equal(isAlertVisible({ ...base, status: "archived" }, now), false);
});

test("alerts order by emergency, breaking, alert, then numeric priority", async () => {
  const { orderAlerts } = await model();
  const alerts = [
    { ...base, id: "alert", type: "alert", priority: 1 },
    { ...base, id: "breaking-low", type: "breaking", priority: 40 },
    { ...base, id: "emergency", type: "emergency", priority: 99 },
    { ...base, id: "breaking-high", type: "breaking", priority: 10 },
  ];
  assert.deepEqual(orderAlerts(alerts).map((item) => item.id), ["emergency", "breaking-high", "breaking-low", "alert"]);
});

test("targeting resolves language, category, and story paths", async () => {
  const { alertMatchesPath } = await model();
  assert.equal(alertMatchesPath(base, "/en/search"), true);
  assert.equal(alertMatchesPath({ ...base, targetScope: "category", categorySlug: "world" }, "/en/category/world"), true);
  assert.equal(alertMatchesPath({ ...base, targetScope: "category", categorySlug: "world" }, "/en/category/business"), false);
  assert.equal(alertMatchesPath({ ...base, targetScope: "story", storySlug: "city-floods" }, "/en/story/city-floods"), true);
  assert.equal(alertMatchesPath({ ...base, languageCode: "hi" }, "/en"), false);
});

test("validation enforces target consistency, schedule order, and hex colors", async () => {
  const { alertFormSchema } = await model();
  const valid = { title: "Flood warning", message: "Avoid low roads", type: "emergency", placement: "emergency_banner", status: "draft", isActive: false, priority: 1, targetScope: "category", languageId: "11111111-1111-4111-8111-111111111111", categoryId: "22222222-2222-4222-8222-222222222222", storyId: "", backgroundColor: "#B42318", textColor: "#FFFFFF", dismissible: false, startAt: "2026-08-03T12:00", endAt: "2026-08-03T13:00" };
  assert.equal(alertFormSchema.safeParse(valid).success, true);
  assert.equal(alertFormSchema.safeParse({ ...valid, categoryId: "" }).success, false);
  assert.equal(alertFormSchema.safeParse({ ...valid, endAt: "2026-08-03T11:00" }).success, false);
  assert.equal(alertFormSchema.safeParse({ ...valid, backgroundColor: "red" }).success, false);
});

test("presentation maps each placement to a distinct visual role", async () => {
  const { getAlertPresentation } = await model();
  assert.deepEqual(getAlertPresentation("breaking_ticker"), { role: "status", label: "Breaking", className: "breaking" });
  assert.equal(getAlertPresentation("pinned_banner").className, "pinned");
  assert.equal(getAlertPresentation("emergency_banner").role, "alert");
});
