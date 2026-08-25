export function buildPublishedStorySearchRequest(
  supabase,
  columns,
  query,
  now = new Date().toISOString(),
) {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from("public_stories")
    .select(columns, { count: "exact" })
    .eq("language_id", query.languageId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", now)
    .textSearch("search_document", query.query, {
      config: "simple",
      type: "websearch",
    })
    .order("published_at", { ascending: false });

  if (query.categoryId) {
    request = request.eq("category_id", query.categoryId);
  }
  if (query.publishedAfter) {
    request = request.gte("published_at", query.publishedAfter);
  }

  return request.range(from, from + query.pageSize - 1);
}
