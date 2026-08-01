export default function StoryLoading() {
  return <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-12" aria-label="Loading story" aria-busy="true"><div className="h-5 w-72 animate-pulse bg-muted" /><div className="h-14 w-full animate-pulse bg-muted" /><div className="h-8 w-3/4 animate-pulse bg-muted" /><div className="aspect-video w-full animate-pulse bg-muted" /><div className="mx-auto h-64 max-w-[720px] animate-pulse bg-muted" /></div>;
}
