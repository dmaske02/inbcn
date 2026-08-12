export default function StoriesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading stories">
      <div className="h-20 animate-pulse rounded-md bg-muted" />
      <div className="h-16 animate-pulse rounded-md bg-muted" />
      <div className="h-96 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
