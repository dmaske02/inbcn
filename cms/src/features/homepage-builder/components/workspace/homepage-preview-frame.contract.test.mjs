import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = "src/features/homepage-builder/components/workspace";

test("preview frame provides fixed desktop, tablet, and mobile iframe viewports", async () => {
  const source = await readFile(`${directory}/homepage-preview-frame.tsx`, "utf8");
  for (const [mode, width] of [["desktop", "1440"], ["tablet", "768"], ["mobile", "390"]]) {
    assert.match(source, new RegExp(`${mode}:[^}]*width:\\s*${width}`, "u"));
  }
  assert.match(source, /aria-pressed/u);
  assert.match(source, /viewport-changed/u);
});

test("preview frame is isolated, revision-aware, and exposes loading and error states accessibly", async () => {
  const source = await readFile(`${directory}/homepage-preview-frame.tsx`, "utf8");
  assert.match(source, /homepage-builder-preview\/\$\{locale\}\?revision=\$\{revision\}/u);
  assert.match(source, /sandbox="allow-same-origin allow-scripts"/u);
  assert.match(source, /title="Homepage visual preview"/u);
  assert.match(source, /onLoad/u);
  assert.match(source, /onError/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /Refreshing homepage preview/u);
  assert.match(source, /Homepage preview refreshed/u);
  assert.match(source, /Homepage preview could not be loaded/u);
});

test("preview frame offers an accessible manual refresh that changes only its cache-busting URL", async () => {
  const source = await readFile(`${directory}/homepage-preview-frame.tsx`, "utf8");
  assert.match(source, /Refresh Preview/u);
  assert.match(source, /aria-label="Refresh homepage preview"/u);
  assert.match(source, /const \[refreshSequence, setRefreshSequence\] = useState\(0\)/u);
  assert.match(
    source,
    /homepage-builder-preview\/\$\{locale\}\?revision=\$\{revision\}&refresh=\$\{refreshSequence\}/u,
  );
  assert.match(source, /setRefreshSequence\(\(current\) => current \+ 1\)/u);

  const refreshButton = source.match(
    /<Button\s+aria-label="Refresh homepage preview"[\s\S]*?<\/Button>/u,
  )?.[0] ?? "";
  assert.match(refreshButton, /type="button"/u);
  assert.doesNotMatch(
    refreshButton,
    /dispatch|saveVisualHomepageSection|previewRevision|revision|mutation/u,
  );
});

test("workspace refreshes only from confirmed preview revision state and preserves viewport state", async () => {
  const source = await readFile(`${directory}/homepage-builder-workspace.tsx`, "utf8");
  assert.match(source, /<HomepagePreviewFrame/u);
  assert.match(source, /revision=\{state\.previewRevision\}/u);
  assert.match(source, /viewport=\{state\.viewport\}/u);
  assert.match(source, /dispatch=\{dispatch\}/u);
  const frame = source.match(/<HomepagePreviewFrame[\s\S]*?\/>/u)?.[0] ?? "";
  assert.doesNotMatch(frame, /draftsBySectionId/u);
});
