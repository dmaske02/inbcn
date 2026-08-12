import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("./components/media-picker.tsx", import.meta.url), "utf8").catch(() => "");
const actions = await readFile(new URL("./media.actions.ts", import.meta.url), "utf8");
const service = await readFile(new URL("./media.service.ts", import.meta.url), "utf8");

test("picker exposes a controlled reusable single-selection contract", () => {
  assert.match(component, /export type MediaPickerProps/u);
  for (const member of ["open", "onOpenChange", "selectedMediaId", "onSelect", "onCancel"]) assert.match(component, new RegExp(member, "u"));
  assert.doesNotMatch(component, /checkbox|multiple/u);
});

test("picker search authenticates and reuses the active media page service", () => {
  assert.match(actions, /searchMediaPickerAction/u);
  assert.match(actions, /requireAdminUser\(\)/u);
  assert.match(actions, /getMediaPickerPage/u);
  assert.match(service, /getMediaPage\(\{/u);
  assert.match(service, /mediaType: type === "image" \? "image" : undefined/u);
  assert.match(service, /pageSize: MEDIA_PICKER_PAGE_SIZE/u);
});

test("picker supports search, filtering, pagination, loading, empty, error, and retry states", () => {
  assert.match(component, /Search media/u);
  assert.match(component, /aria-label="Media type"/u);
  assert.match(component, /Previous/u);
  assert.match(component, /Next/u);
  assert.match(component, /Loading media/u);
  assert.match(component, /No media assets available/u);
  assert.match(component, /No media matches your search/u);
  assert.match(component, /No media matches this filter/u);
  assert.match(component, /Unable to load media\. Try again\./u);
  assert.match(component, /Retry/u);
});

test("picker rejects stale responses and resets pagination when discovery criteria change", () => {
  assert.match(component, /requestSequence = useRef\(0\)/u);
  assert.match(component, /sequence !== requestSequence\.current/u);
  assert.match(component, /setPage\(1\)/u);
  assert.match(component, /window\.setTimeout/u);
});

test("picker selection is keyboard accessible, explicit, and only confirmed by Select", () => {
  assert.match(component, /aria-pressed=\{draftSelectedId === item\.id\}/u);
  assert.match(component, /aria-label=\{`Select \$\{item\.title\}`\}/u);
  assert.match(component, /disabled=\{!selectedItem\}/u);
  assert.match(component, /onSelect\(selectedItem\)/u);
  assert.match(component, /Check/u);
});

test("picker uses Radix dialog focus behavior and responsive grid hooks", () => {
  assert.match(component, /DialogPrimitive\.Title/u);
  assert.match(component, /autoFocus/u);
  assert.match(component, /onCloseAutoFocus/u);
  assert.match(component, /sm:grid-cols-2/u);
  assert.match(component, /lg:grid-cols-3/u);
  assert.match(component, /max-h-\[90dvh\]/u);
});

test("picker contains no upload, metadata editing, deletion, or persistence mutation", () => {
  assert.doesNotMatch(component, /uploadMedia|updateMediaMetadata|deleteMedia|retireMedia|featuredMediaId/u);
});
