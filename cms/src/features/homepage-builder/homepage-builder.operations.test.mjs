import assert from "node:assert/strict";
import test from "node:test";
import { createHomepageBuilderOperations } from "./homepage-builder.operations.ts";

const admin = (role) => ({ id:"actor", email:null, displayName:"Editor", role, preferredLanguage:null });
const row = { id:"section", homepageConfigurationId:"config", blockId:"lead", title:"Lead", blockType:"latest-news", renderer:"latest-news", position:0, container:"main", width:"full", enabled:true, startsAt:null, endsAt:null, configuration:{ limit:12 }, createdBy:null, updatedBy:null, createdAt:"2026-08-11T09:00:00.000Z", updatedAt:"2026-08-11T09:00:00.000Z" };
const input = { blockId:"lead", title:"Lead", blockType:"latest-news", renderer:"latest-news", container:"main", width:"full", enabled:true, startsAt:null, endsAt:null, configuration:{ limit:12 } };

test("writers cannot mutate and editor creates at the next position with audit identity", async () => {
  let inserted;
  const operations = createHomepageBuilderOperations({ listSections:async()=>[row], getSection:async()=>row, createSection:async(value)=>(inserted=value,row), updateSection:async()=>row, updateSectionIfCurrent:async()=>row, deleteSection:async()=>{}, moveSectionUp:async()=>{}, moveSectionDown:async()=>{} });
  await assert.rejects(operations.create(admin("writer"), "config", input), /cannot manage/u);
  await operations.create(admin("editor"), "config", input);
  assert.equal(inserted.position, 1); assert.equal(inserted.created_by, "actor"); assert.equal(inserted.updated_by, "actor");
});

test("operations verify ownership and delegate move, toggle, and delete", async () => {
  const calls=[];
  const operations = createHomepageBuilderOperations({ listSections:async()=>[row], getSection:async()=>row, createSection:async()=>row, updateSection:async(id,value)=>(calls.push(["update",id,value]),row), updateSectionIfCurrent:async()=>row, deleteSection:async(id)=>{calls.push(["delete",id]);}, moveSectionUp:async(id)=>{calls.push(["up",id]);}, moveSectionDown:async(id)=>{calls.push(["down",id]);} });
  await operations.toggle(admin("admin"), "section", "config"); await operations.move(admin("editor"), "section", "config", "down"); await operations.remove(admin("admin"), "section", "config");
  assert.equal(calls[0][2].enabled, false); assert.deepEqual(calls.slice(1), [["down","section"],["delete","section"]]);
  await assert.rejects(operations.remove(admin("admin"), "section", "other"), /not found/u);
});

test("conflict-aware updates require matching timestamps and configuration ownership", async () => {
  const calls = [];
  const operations = createHomepageBuilderOperations({
    listSections: async () => [row],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async (id, expectedUpdatedAt, values) => {
      calls.push([id, expectedUpdatedAt, values]);
      return row;
    },
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
  });

  await assert.rejects(
    operations.updateIfCurrent(admin("editor"), "section", "config", "2026-08-11T08:59:59.000Z", input),
    (error) => error?.code === "CONFLICT",
  );
  await assert.rejects(
    operations.updateIfCurrent(admin("editor"), "section", "other", row.updatedAt, input),
    (error) => error?.code === "NOT_FOUND",
  );
  await operations.updateIfCurrent(admin("editor"), "section", "config", row.updatedAt, input);

  assert.deepEqual(calls, [["section", row.updatedAt, {
    block_id: "lead",
    title: "Lead",
    block_type: "latest-news",
    renderer: "latest-news",
    container: "main",
    width: "full",
    enabled: true,
    starts_at: null,
    ends_at: null,
    configuration: { limit: 12 },
    updated_by: "actor",
  }]]);
});

test("a zero-row conditional update becomes a stable conflict and writers remain rejected", async () => {
  const operations = createHomepageBuilderOperations({
    listSections: async () => [row],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async () => null,
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
  });

  await assert.rejects(
    operations.updateIfCurrent(admin("admin"), "section", "config", row.updatedAt, input),
    (error) => error?.code === "CONFLICT" && /reload required/iu.test(error.message),
  );
  await assert.rejects(
    operations.setEnabledIfCurrent(admin("writer"), "section", "config", row.updatedAt, false),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("explicit enable mutations use optimistic concurrency and server audit identity", async () => {
  let update;
  const disabled = { ...row, enabled: false };
  const operations = createHomepageBuilderOperations({
    listSections: async () => [row],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async (...args) => (update = args, disabled),
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
  });

  const result = await operations.setEnabledIfCurrent(admin("admin"), "section", "config", row.updatedAt, false);
  assert.equal(result.enabled, false);
  assert.deepEqual(update, ["section", row.updatedAt, { enabled: false, updated_by: "actor" }]);
});

test("target-index movement validates authorization, membership, bounds, and expected order", async () => {
  const second = { ...row, id: "section-2", blockId: "second", position: 1 };
  const third = { ...row, id: "section-3", blockId: "third", position: 2 };
  const calls = [];
  const repository = {
    listSections: async (configurationId) => configurationId === "config" ? [row, second, third] : [],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async () => row,
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
    moveSectionTo: async (id, targetPosition, configurationId) => {
      calls.push([id, targetPosition, configurationId]);
      return [{ ...second, position: 0 }, { ...third, position: 1 }, { ...row, position: 2 }];
    },
  };
  const operations = createHomepageBuilderOperations(repository);

  await assert.rejects(
    operations.moveTo(admin("writer"), row.id, "config", 2, [row.id, second.id, third.id]),
    (error) => error?.code === "FORBIDDEN",
  );
  await assert.rejects(
    operations.moveTo(admin("editor"), row.id, "other", 2, [row.id, second.id, third.id]),
    (error) => error?.code === "NOT_FOUND",
  );
  await assert.rejects(
    operations.moveTo(admin("editor"), row.id, "config", 3, [row.id, second.id, third.id]),
    (error) => error?.code === "ORDERING",
  );
  await assert.rejects(
    operations.moveTo(admin("editor"), row.id, "config", 2, [second.id, row.id, third.id]),
    (error) => error?.code === "CONFLICT",
  );

  const result = await operations.moveTo(
    admin("admin"),
    row.id,
    "config",
    2,
    [row.id, second.id, third.id],
  );
  assert.deepEqual(calls, [[row.id, 2, "config"]]);
  assert.deepEqual(result.map((item) => item.id), [second.id, third.id, row.id]);
});

test("target-index no-op returns the current authoritative order without an RPC", async () => {
  const calls = [];
  const repository = {
    listSections: async () => [row],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async () => row,
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
    moveSectionTo: async () => { calls.push("rpc"); return [row]; },
  };
  const result = await createHomepageBuilderOperations(repository)
    .moveTo(admin("editor"), row.id, "config", 0, [row.id]);
  assert.deepEqual(result, [row]);
  assert.deepEqual(calls, []);
});

test("duplicate preserves source values and rejects stale ownership or ordering", async () => {
  const second = { ...row, id: "section-2", blockId: "second", position: 1 };
  const confirmedCopy = { ...row, id: "copy", blockId: "lead-copy", title: "Lead Copy", position: 1 };
  const calls = [];
  const repository = {
    listSections: async (configurationId) => configurationId === "config" ? [row, second] : [],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async () => row,
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
    moveSectionTo: async () => [row, second],
    duplicateSectionAfter: async (...args) => {
      calls.push(args);
      return { section: confirmedCopy, sections: [row, confirmedCopy, { ...second, position: 2 }] };
    },
    deleteSectionIfCurrent: async () => [row],
  };
  const operations = createHomepageBuilderOperations(repository);

  await assert.rejects(
    operations.duplicate(admin("writer"), row.id, "config", row.updatedAt, [row.id, second.id], "lead-copy", "Lead Copy"),
    (error) => error?.code === "FORBIDDEN",
  );
  await assert.rejects(
    operations.duplicate(admin("editor"), row.id, "config", "2026-08-11T08:00:00.000Z", [row.id, second.id], "lead-copy", "Lead Copy"),
    (error) => error?.code === "CONFLICT",
  );
  await assert.rejects(
    operations.duplicate(admin("editor"), row.id, "config", row.updatedAt, [second.id, row.id], "lead-copy", "Lead Copy"),
    (error) => error?.code === "CONFLICT",
  );

  const result = await operations.duplicate(
    admin("admin"), row.id, "config", row.updatedAt, [row.id, second.id], "lead-copy", "Lead Copy",
  );
  assert.deepEqual(calls, [[row.id, row.updatedAt, [row.id, second.id], "lead-copy", "Lead Copy", "config"]]);
  assert.deepEqual(result.sections.map((item) => [item.id, item.position]), [[row.id, 0], ["copy", 1], [second.id, 2]]);
});

test("conditional delete rejects conflicts and returns compact authoritative ordering", async () => {
  const second = { ...row, id: "section-2", blockId: "second", position: 1 };
  const calls = [];
  let conflict = true;
  const repository = {
    listSections: async () => [row, second],
    getSection: async () => row,
    createSection: async () => row,
    updateSection: async () => row,
    updateSectionIfCurrent: async () => row,
    deleteSection: async () => {},
    moveSectionUp: async () => {},
    moveSectionDown: async () => {},
    moveSectionTo: async () => [row, second],
    duplicateSectionAfter: async () => null,
    deleteSectionIfCurrent: async (...args) => {
      calls.push(args);
      return conflict ? null : [{ ...second, position: 0 }];
    },
  };
  const operations = createHomepageBuilderOperations(repository);
  await assert.rejects(
    operations.deleteIfCurrent(admin("editor"), row.id, "config", row.updatedAt, [row.id, second.id]),
    (error) => error?.code === "CONFLICT",
  );
  conflict = false;
  const result = await operations.deleteIfCurrent(
    admin("admin"), row.id, "config", row.updatedAt, [row.id, second.id],
  );
  assert.deepEqual(calls.at(-1), [row.id, row.updatedAt, [row.id, second.id], "config"]);
  assert.deepEqual(result.map((item) => [item.id, item.position]), [[second.id, 0]]);
});
