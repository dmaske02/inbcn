import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL("./globals.css", import.meta.url);

test("public routes expose the approved editorial color system", async () => {
  const css = await readFile(cssPath, "utf8");
  const expectedTokens = {
    "--editorial-bg": "oklch(98% 0.004 95)",
    "--editorial-surface": "oklch(100% 0.002 95)",
    "--editorial-fg": "oklch(20% 0.018 70)",
    "--editorial-muted": "oklch(48% 0.012 70)",
    "--editorial-fg-soft": "oklch(96% 0.006 95)",
    "--editorial-border": "oklch(90% 0.006 95)",
    "--editorial-accent": "oklch(45% 0.17 28)",
    "--editorial-inverted": "oklch(17% 0.018 70)",
  };

  for (const [name, value] of Object.entries(expectedTokens)) {
    assert.match(css, new RegExp(`${name}:\\s*${value.replace(/[()%.]/gu, "\\$&")}`));
  }

  const publicSite = css.match(/\.public-site\s*\{(?<body>[\s\S]*?)\n\s*\}/u)?.groups?.body ?? "";
  assert.match(publicSite, /--background:\s*var\(--editorial-bg\)/u);
  assert.match(publicSite, /background:\s*var\(--editorial-bg\)/u);
  assert.doesNotMatch(publicSite, /#f6f3ed/iu);
});

test("editorial utilities establish measure, typography, rules, and motion safety", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /--editorial-container:\s*1180px/u);
  assert.match(css, /--editorial-serif:[^;]*Charter[^;]*Iowan Old Style[^;]*Georgia/iu);
  assert.match(css, /--editorial-sans:[^;]*system-ui/iu);
  assert.match(css, /--editorial-mono:[^;]*ui-monospace[^;]*Menlo/iu);
  assert.match(css, /\.editorial-container\s*\{[^}]*max-width:\s*var\(--editorial-container\)/su);
  assert.match(css, /\.editorial-headline\s*\{[^}]*text-wrap:\s*balance/su);
  assert.match(css, /\.editorial-meta\s*\{[^}]*font-family:\s*var\(--editorial-mono\)/su);
  assert.match(css, /\.editorial-hairline\s*\{[^}]*border(?:-block-start|-top):\s*1px solid var\(--editorial-border\)/su);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});
