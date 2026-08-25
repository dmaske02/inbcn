import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [actions, form] = await Promise.all([
  readFile(new URL("./story.actions.ts", import.meta.url), "utf8"),
  readFile(new URL("./story-form.tsx", import.meta.url), "utf8"),
]);

const reviewActions = await readFile(new URL("./story-review-actions.tsx", import.meta.url), "utf8");

test("story edit and transition forms submit the loaded version", () => {
  assert.match(form, /name="expectedUpdatedAt"[^>]*value=\{story\.updatedAt\}/u);
  assert.match(actions, /formData\.get\("expectedUpdatedAt"\)/u);
});

test("conflicts return a safe non-destructive message", () => {
  assert.match(actions, /Story was changed by another editor\. Reload before saving\./u);
});

test("workflow actions revalidate only after a successful service call", () => {
  const action = actions.match(
    /export async function storyCommandAction[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  assert.match(
    action,
    /await runStoryCommand[\s\S]*await revalidateStories\(id, command === "publish" \|\| command === "archive"\)/u,
  );
  const catchBody = action.match(/catch \(error\) \{([\s\S]*?)\n  \}/u)?.[1] ?? "";
  assert.doesNotMatch(catchBody, /revalidateStories/u);
});

test("successful workflow actions refresh list, queue, and Story detail", () => {
  assert.match(actions, /revalidatePath\("\/admin\/stories\/review"\)/u);
  assert.match(actions, /revalidatePath\(`\/admin\/stories\/\$\{storyId\}`\)/u);
});

test("send back reason is trimmed, bounded, and rejects control characters", () => {
  assert.match(actions, /rejectionReasonSchema\.safeParse/u);
  assert.match(actions, /Reason is required/u);
  assert.match(actions, /1000/u);
  assert.match(actions, /control characters/u);
});

test("review decisions use accessible Radix confirmation dialogs", () => {
  assert.match(reviewActions, /DialogPrimitive\.Title/u);
  assert.match(reviewActions, /DialogPrimitive\.Description/u);
  assert.match(reviewActions, /Approve this Story for publication\?/u);
  assert.match(reviewActions, /Send this Story back for revision\?/u);
  assert.match(reviewActions, /Return this Story to draft\?/u);
  assert.match(reviewActions, /aria-invalid/u);
  assert.match(reviewActions, /aria-live="polite"/u);
});

test("rejected Stories show the persisted reason without exposing actor IDs", () => {
  assert.match(form, /story\.rejectionReason/u);
  assert.doesNotMatch(form, /rejectedBy/u);
});
