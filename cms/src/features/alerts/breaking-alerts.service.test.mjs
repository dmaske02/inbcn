import assert from "node:assert/strict";
import test from "node:test";

const admin = { id: "admin-1", role: "admin" };
const editor = { id: "editor-1", role: "editor" };
const values = { title: "Flood warning", message: "Avoid low roads", type: "emergency", placement: "emergency_banner", status: "draft", isActive: false, priority: 1, targetScope: "global", languageId: "11111111-1111-4111-8111-111111111111", categoryId: "", storyId: "", backgroundColor: "#B42318", textColor: "#FFFFFF", dismissible: false, startAt: "2026-08-03T12:00", endAt: "" };

async function serviceWith(alert = null) {
  const writes = [];
  const serviceModule = await import("./breaking-alerts.service.ts").catch(() => null);
  assert.ok(serviceModule, "breaking alert service should exist");
  const service = serviceModule.createAlertService({
    getById: async () => alert,
    insert: async (input) => { writes.push({ kind: "insert", input }); return { id: "new-alert", ...input }; },
    update: async (id, input) => { writes.push({ kind: "update", id, input }); return { ...alert, ...input }; },
    remove: async (id) => { writes.push({ kind: "remove", id }); },
    targetMatchesLanguage: async () => true,
  });
  return { service, writes };
}

test("editor creates a private draft even when submitted values request active", async () => {
  const { service, writes } = await serviceWith();
  await service.create(editor, { ...values, status: "active", isActive: true });
  assert.equal(writes[0].input.status, "draft");
  assert.equal(writes[0].input.is_active, false);
  assert.equal(writes[0].input.created_by, "editor-1");
});

test("service rejects a category or story outside the selected language", async () => {
  const serviceModule = await import("./breaking-alerts.service.ts");
  const service = serviceModule.createAlertService({
    getById: async () => null, insert: async () => ({ id: "never" }), update: async () => ({}), remove: async () => {},
    targetMatchesLanguage: async () => false,
  });
  await assert.rejects(() => service.create(editor, { ...values, targetScope: "category", categoryId: "22222222-2222-4222-8222-222222222222" }), /selected language/i);
});

test("lifecycle commands activate, deactivate, and archive through repository patches", async () => {
  const existing = { id: "alert-1", status: "draft", is_active: false, created_by: "editor-1", title: "Flood" };
  const { service, writes } = await serviceWith(existing);
  await service.command(editor, "alert-1", "activate");
  await service.command(editor, "alert-1", "deactivate");
  await service.command(editor, "alert-1", "archive");
  assert.deepEqual(writes.map((item) => item.input), [
    { status: "active", is_active: true },
    { is_active: false },
    { status: "archived", is_active: false },
  ]);
});

test("only admins can permanently delete an alert", async () => {
  const existing = { id: "alert-1", status: "archived", is_active: false, created_by: "editor-1", title: "Flood" };
  const editorService = await serviceWith(existing);
  await assert.rejects(() => editorService.service.command(editor, "alert-1", "delete"), /administrator/i);
  const adminService = await serviceWith(existing);
  await adminService.service.command(admin, "alert-1", "delete");
  assert.deepEqual(adminService.writes, [{ kind: "remove", id: "alert-1" }]);
});

test("duplicate creates a new draft with targeting and presentation preserved", async () => {
  const existing = { id: "alert-1", title: "Flood", message: "Stay home", type: "breaking", placement: "breaking_ticker", status: "active", is_active: true, priority: 4, target_scope: "global", language_id: values.languageId, category_id: null, story_id: null, background_color: "#B42318", text_color: "#FFFFFF", dismissible: true, start_at: "2026-08-03T12:00:00.000Z", end_at: null, created_by: "editor-1" };
  const { service, writes } = await serviceWith(existing);
  await service.command(editor, "alert-1", "duplicate");
  assert.equal(writes[0].input.title, "Flood (Copy)");
  assert.equal(writes[0].input.status, "draft");
  assert.equal(writes[0].input.is_active, false);
});
