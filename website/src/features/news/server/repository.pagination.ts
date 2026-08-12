export type RepositoryPage<T> = Readonly<{
  items: readonly T[];
  total: number;
}>;

export async function collectRepositoryPages<T>(
  loadPage: (from: number, to: number) => Promise<RepositoryPage<T>>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError("Repository page size must be a positive integer.");
  }

  const items: T[] = [];
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const page = await loadPage(items.length, items.length + pageSize - 1);
    total = page.total;

    if (page.items.length === 0) {
      break;
    }

    items.push(...page.items);
  }

  return items;
}
