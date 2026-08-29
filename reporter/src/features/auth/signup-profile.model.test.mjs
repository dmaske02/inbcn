import assert from "node:assert/strict";
import test from "node:test";

import { applicantProfileInsert, validateSignupProfile } from "./applicant-profile.model.ts";

const userId = "f707b003-3ddc-4556-bc46-e4996958d4f4";
const languageId = "5ac922dd-5db8-4d18-907f-762d44f12be1";

test("validates and trims the basic Reporter signup profile", () => {
  assert.deepEqual(validateSignupProfile({
    fullName: "  Synthetic Reporter  ",
    email: " REPORTER@EXAMPLE.COM ",
    cityLocality: " Synthetic Test Locality ",
    state: " Karnataka ",
    preferredLanguageId: languageId,
    experience: " Community newsletter volunteer. ",
    introduction: " I want to cover verified civic news. ",
  }), {
    ok: true,
    data: {
      fullName: "Synthetic Reporter",
      email: "reporter@example.com",
      cityLocality: "Synthetic Test Locality",
      state: "Karnataka",
      preferredLanguageId: languageId,
      experience: "Community newsletter volunteer.",
      introduction: "I want to cover verified civic news.",
    },
  });
});

test("rejects missing or malformed required signup details", () => {
  const result = validateSignupProfile({ fullName: " ", email: "bad", cityLocality: "", state: "", preferredLanguageId: "english", introduction: "" });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["cityLocality", "email", "fullName", "introduction", "preferredLanguageId", "state"]);
});

test("creates only a non-privileged reader profile from server-owned fields", () => {
  assert.deepEqual(applicantProfileInsert(userId, {
    fullName: "Synthetic Reporter",
    email: "reporter@example.com",
    cityLocality: "Synthetic Test Locality",
    state: "Karnataka",
    preferredLanguageId: languageId,
    experience: "",
    introduction: "Civic reporting.",
  }), {
    id: userId,
    username: "reporter_f707b0033ddc4556",
    display_name: "Synthetic Reporter",
    preferred_language_id: languageId,
    bio: "Civic reporting.",
    role: "reader",
  });
});
