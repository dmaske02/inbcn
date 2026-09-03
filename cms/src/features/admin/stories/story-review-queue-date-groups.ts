export const REVIEW_QUEUE_TIME_ZONE = "Asia/Kolkata";

export type ReviewQueueDateGroup<T> = Readonly<{
  key: string;
  heading: string;
  countLabel: string;
  items: readonly T[];
}>;

const datePartsFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  weekday: "long",
  timeZone: REVIEW_QUEUE_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: REVIEW_QUEUE_TIME_ZONE,
});

function submissionDateParts(value: string) {
  return Object.fromEntries(
    datePartsFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function submissionDateKey(value: string): string {
  const parts = submissionDateParts(value);
  const month = String(new Date(value).toLocaleString("en", {
    month: "2-digit",
    timeZone: REVIEW_QUEUE_TIME_ZONE,
  }));
  return `${parts.year}-${month}-${String(parts.day).padStart(2, "0")}`;
}

export function formatReviewQueueDateHeading(value: string | null): string {
  if (!value) return "Submission date unavailable";
  const parts = submissionDateParts(value);
  return `${parts.month} ${parts.day}, ${parts.year} · ${parts.weekday}`;
}

export function formatReviewQueueSubmissionTime(value: string | null): string {
  if (!value) return "—";
  return timeFormatter.format(new Date(value)).replace(/\b(am|pm)\b/iu, (period) => period.toUpperCase());
}

export function formatReviewQueueCount(count: number): string {
  return `${count} ${count === 1 ? "story" : "stories"} submitted`;
}

export function groupStoriesBySubmissionDate<T extends Readonly<{ submittedAt: string | null }>>(
  items: readonly T[],
): readonly ReviewQueueDateGroup<T>[] {
  const grouped = new Map<string, { heading: string; items: T[] }>();

  for (const item of items) {
    const key = item.submittedAt ? submissionDateKey(item.submittedAt) : "unavailable";
    const existing = grouped.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    grouped.set(key, {
      heading: formatReviewQueueDateHeading(item.submittedAt),
      items: [item],
    });
  }

  return [...grouped.entries()].map(([key, group]) => ({
    key,
    heading: group.heading,
    countLabel: formatReviewQueueCount(group.items.length),
    items: group.items,
  }));
}
