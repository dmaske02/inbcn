import Image from "next/image";
import Link from "next/link";
import { Calendar, Database, ImageIcon, Search, Upload } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MediaPreviewDialog } from "./media-preview-dialog";
import { MediaUploadForm } from "./media-upload-form";
import type { MediaLibraryView } from "./media.service";

const control = "min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";

function pageHref(view: MediaLibraryView, page: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (view.filters.search) params.set("search", view.filters.search);
  if (view.filters.type !== "all") params.set("type", view.filters.type);
  if (view.filters.date !== "all") params.set("date", view.filters.date);
  if (view.filters.sort !== "newest") params.set("sort", view.filters.sort);
  if (view.filters.lifecycle === "retired") params.set("lifecycle", "retired");
  const query = params.toString();
  return `/admin/media${query ? `?${query}` : ""}`;
}

function emptyCopy(view: MediaLibraryView) {
  if (view.page > view.totalPages) return { title: "This page has no media", description: "Return to the first page to continue browsing." };
  if (view.filters.search) return { title: "No media matches your search", description: "Try a different title, filename, credit, or caption." };
  if (view.filters.type !== "all" || view.filters.date !== "all") return { title: "No media matches these filters", description: "Clear the filters to see the complete library." };
  return { title: "Your media library is empty", description: "Upload your first media asset using the secure form." };
}

export function MediaLibrary({ view }: Readonly<{ view: MediaLibraryView }>) {
  const empty = emptyCopy(view);
  const first = view.total === 0 ? 0 : (view.page - 1) * view.pageSize + 1;
  const last = Math.min(view.page * view.pageSize, view.total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(15rem,1fr)_auto_auto_auto_auto_auto]" method="get">
          <label className="relative min-w-0"><span className="sr-only">Search media</span><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className={`${control} w-full ps-9`} defaultValue={view.filters.search} name="search" placeholder="Search title, filename, or credit" type="search" /></label>
          <label><span className="sr-only">Media type</span><select className={`${control} w-full`} defaultValue={view.filters.type} name="type"><option value="all">All media</option><option value="image">Images</option></select></label>
          <label><span className="sr-only">Creation date</span><select className={`${control} w-full`} defaultValue={view.filters.date} name="date"><option value="all">Any date</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
          <label><span className="sr-only">Sort media</span><select className={`${control} w-full`} defaultValue={view.filters.sort} name="sort"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="largest">Largest</option></select></label>
          <label><span className="sr-only">Lifecycle state</span><select className={`${control} w-full`} defaultValue={view.filters.lifecycle} name="lifecycle"><option value="active">Active</option><option value="retired">Retired</option></select></label>
          <Button type="submit" variant="outline">Apply</Button>
        </form>
        <a className={buttonVariants({ variant: "default" })} href="#upload-media"><Upload aria-hidden="true" />Upload media</a>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="media-grid-title" className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div><h2 id="media-grid-title" className="text-xl font-semibold">{view.filters.lifecycle === "retired" ? "Retired" : "Library"}</h2><p className="mt-1 text-sm text-muted-foreground">{view.total === 0 ? `No ${view.filters.lifecycle} media` : `Showing ${first}–${last} of ${view.total} ${view.filters.lifecycle} assets`}</p></div>
            {(view.filters.search || view.filters.type !== "all" || view.filters.date !== "all") ? <Link className="text-sm font-medium underline underline-offset-4" href="/admin/media">Clear search and filters</Link> : null}
          </div>

          {view.items.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {view.items.map((item) => (
                <Card className="group min-w-0 overflow-hidden transition-shadow hover:shadow-md" key={item.id} padding="none">
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {item.mediaType === "image" ? <Image alt={item.altText || item.title} className="object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transition-none" fill loading="lazy" sizes="(min-width: 1280px) 28vw, (min-width: 640px) 50vw, 100vw" src={item.thumbnailUrl} /> : <div className="flex h-full items-center justify-center"><ImageIcon aria-hidden="true" className="size-10 text-muted-foreground" /></div>}
                  </div>
                  <CardContent className="space-y-4">
                    <div className="min-w-0"><div className="flex items-start justify-between gap-3"><h3 className="line-clamp-2 font-semibold leading-snug">{item.title}</h3><Badge className="shrink-0 capitalize" variant="secondary">{item.mediaType}</Badge></div>{item.originalFilename ? <p className="mt-1 truncate text-xs text-muted-foreground" title={item.originalFilename}>{item.originalFilename}</p> : null}</div>
                    <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground"><div className="flex items-center gap-1.5"><Database aria-hidden="true" className="size-3.5" /><span>{item.width && item.height ? `${item.width}×${item.height}` : "Dimensions unavailable"}</span></div><div className="flex items-center justify-end gap-1.5"><Calendar aria-hidden="true" className="size-3.5" /><span>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.createdAt))}</span></div></dl>
                    <MediaPreviewDialog item={item} />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState align="center" className="min-h-72 justify-center rounded-md border border-dashed border-border" title={empty.title} description={empty.description} action={<Link className="text-sm font-medium underline underline-offset-4" href={view.page > view.totalPages ? pageHref(view, 1) : "/admin/media"}>{view.page > view.totalPages ? "Return to first page" : "Clear search and filters"}</Link>} />}

          {view.totalPages > 1 || view.page > 1 ? <Pagination currentPage={view.page} nextHref={view.page < view.totalPages ? pageHref(view, view.page + 1) : undefined} previousHref={view.page > 1 ? pageHref(view, view.page - 1) : undefined} totalPages={view.totalPages} /> : null}
        </section>

        <Card className="scroll-mt-6 xl:sticky xl:top-6" id="upload-media" padding="none"><CardHeader><div className="flex items-center gap-2"><ImageIcon aria-hidden="true" className="size-5" /><h2 className="text-lg font-semibold">Upload media</h2></div><p className="text-sm text-muted-foreground">Secure image uploads, validated before Cloudinary storage.</p></CardHeader><CardContent><MediaUploadForm compact /></CardContent></Card>
      </div>
    </div>
  );
}
