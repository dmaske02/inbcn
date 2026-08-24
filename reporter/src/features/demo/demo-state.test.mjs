import assert from "node:assert/strict";
import test from "node:test";

import {
  addStory,
  advanceOnboarding,
  initialDemoState,
  submitStory,
} from "./demo-state.ts";

test("onboarding follows signup, application, payment, KYC and approval in order", () => {
  let state = initialDemoState();
  for (const stage of ["application", "payment", "kyc", "approval", "app"]) {
    state = advanceOnboarding(state);
    assert.equal(state.stage, stage);
  }
});

test("reporters can save a draft and submit it for editorial review", () => {
  const draft = addStory(initialDemoState(), {
    title: "Waterlogging closes Karve Road",
    summary: "Traffic was diverted after afternoon rain.",
    body: "Residents and commuters reported knee-deep water near the junction.",
    beat: "Civic affairs",
    language: "English",
    location: "Karve Road, Pune",
  });

  assert.equal(draft.stories[0]?.status, "Draft");
  const submitted = submitStory(draft, draft.stories[0].id);
  assert.equal(submitted.stories[0]?.status, "Under review");
});
