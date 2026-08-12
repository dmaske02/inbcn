import assert from "node:assert/strict";
import test from "node:test";

test("repository row mapping preserves targeting and presentation fields", async () => {
  const repositoryModel = await import("./breaking-alerts.repository-model.ts").catch(() => null);
  assert.ok(repositoryModel, "repository row mapper should exist");
  const result = repositoryModel.mapPublicAlertRow({
    id: "a1", title: "Flood", message: "Stay home", type: "emergency", placement: "emergency_banner",
    status: "active", is_active: true, priority: 2, target_scope: "category", background_color: "#B42318",
    text_color: "#FFFFFF", dismissible: false, start_at: "2026-08-03T10:00:00Z", end_at: null,
    language: { code: "en" }, category: { slug: "world" }, story: null,
  });
  assert.equal(result.languageCode, "en");
  assert.equal(result.categorySlug, "world");
  assert.equal(result.placement, "emergency_banner");
  assert.equal(result.dismissible, false);
});
