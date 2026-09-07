import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_QUEUE_TIME_ZONE,
  formatReviewQueueCount,
  formatReviewQueueDateHeading,
  formatReviewQueueSubmissionTime,
  groupStoriesBySubmissionDate,
} from "./story-review-queue-date-groups.ts";

test("uses the CMS timezone and formats the IST date, weekday, and exact time", () => {
  assert.equal(REVIEW_QUEUE_TIME_ZONE, "Asia/Kolkata");
  assert.equal(
    formatReviewQueueDateHeading("2026-09-03T18:30:00.000Z"),
    "September 4, 2026 · Friday",
  );
  assert.equal(
    formatReviewQueueSubmissionTime("2026-09-03T18:30:00.000Z"),
    "12:00 AM",
  );
});

test("groups timestamps across the UTC to IST midnight boundary", () => {
  const beforeMidnight = { id: "newer-on-september-3", submittedAt: "2026-09-03T18:29:00.000Z" };
  const afterMidnight = { id: "september-4", submittedAt: "2026-09-03T18:30:00.000Z" };

  const groups = groupStoriesBySubmissionDate([afterMidnight, beforeMidnight]);

  assert.deepEqual(
    groups.map((group) => ({ heading: group.heading, ids: group.items.map((item) => item.id) })),
    [
      { heading: "September 4, 2026 · Friday", ids: ["september-4"] },
      { heading: "September 3, 2026 · Thursday", ids: ["newer-on-september-3"] },
    ],
  );
});

test("preserves server order within a date including identical timestamps", () => {
  const items = [
    { id: "a", submittedAt: "2026-09-03T12:00:00.000Z" },
    { id: "b", submittedAt: "2026-09-03T12:00:00.000Z" },
    { id: "c", submittedAt: "2026-09-03T10:00:00.000Z" },
  ];

  const [group] = groupStoriesBySubmissionDate(items);

  assert.deepEqual(group.items.map((item) => item.id), ["a", "b", "c"]);
});

test("formats singular and plural page-local counts", () => {
  assert.equal(formatReviewQueueCount(1), "1 story submitted");
  assert.equal(formatReviewQueueCount(2), "2 stories submitted");
  assert.equal(formatReviewQueueCount(10), "10 stories submitted");
});

test("groups missing timestamps without inventing a date or time", () => {
  const groups = groupStoriesBySubmissionDate([
    { id: "dated", submittedAt: "2026-09-03T12:00:00.000Z" },
    { id: "missing-a", submittedAt: null },
    { id: "missing-b", submittedAt: null },
  ]);

  assert.equal(groups.at(-1)?.key, "unavailable");
  assert.equal(groups.at(-1)?.heading, "Submission date unavailable");
  assert.equal(groups.at(-1)?.countLabel, "2 stories submitted");
  assert.deepEqual(groups.at(-1)?.items.map((item) => item.id), ["missing-a", "missing-b"]);
  assert.equal(formatReviewQueueDateHeading(null), "Submission date unavailable");
  assert.equal(formatReviewQueueSubmissionTime(null), "—");
});
