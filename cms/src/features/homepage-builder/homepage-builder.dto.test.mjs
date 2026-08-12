import assert from "node:assert/strict";
import test from "node:test";
import { toHomepageSectionDto } from "./homepage-builder.dto.ts";

test("section DTO maps persistence fields without leaking snake case", () => {
  const dto = toHomepageSectionDto({ id:"s", homepage_configuration_id:"h", block_id:"lead", title:"Lead", block_type:"hero-story", renderer:"hero-story", position:0, container:"main", width:"full", enabled:true, starts_at:null, ends_at:null, configuration:{ storyId:"x" }, created_by:"a", updated_by:"b", created_at:"c", updated_at:"u" });
  assert.equal(dto.homepageConfigurationId, "h");
  assert.equal(dto.blockType, "hero-story");
  assert.deepEqual(dto.configuration, { storyId: "x" });
  assert.equal("block_type" in dto, false);
});
