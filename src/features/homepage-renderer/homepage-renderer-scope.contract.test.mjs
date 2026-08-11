import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("Phase 2 remains outside protected unrelated feature boundaries",async()=>{const files=["src/app/[locale]/layout.tsx","src/i18n/routing.ts","src/features/broadcast-studio/components/broadcast-studio.tsx","src/features/live-broadcast/livekit.service.ts","src/features/admin/live-tv/live-tv.service.ts","src/features/admin/imports/rss.operations.ts","src/features/admin/stories/story.service.ts","src/features/news/server/categories.repository.ts"];for(const file of files)assert.doesNotMatch(await readFile(file,"utf8"),/homepage-renderer/u,file);});
