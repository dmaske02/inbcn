import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
test('placement is a separate authenticated action and review UI retains canonical Builder links',async()=>{
 const action=await readFile(new URL('./story-placement.actions.ts',import.meta.url),'utf8');
 assert.match(action,/requireAdminUser/);assert.match(action,/set_story_editors_pick/);assert.match(action,/p_expected_updated_at/);assert.doesNotMatch(action,/createAdminClient|service.role|transition_story/);
 const ui=await readFile(new URL('./story-placement.tsx',import.meta.url),'utf8');assert.match(ui,/Editorial placement/);assert.match(ui,/homepage-builder\?locale=/);assert.match(ui,/story\.status === "published"/);
});
