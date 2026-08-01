import Image from "next/image";
import Link from "next/link";
import { Calendar, Database, ImageIcon, Search, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { deleteMediaAction } from "./media.actions";
import { MediaUploadForm } from "./media-upload-form";
import type { MediaLibraryView } from "./media.service";

const control =
  "min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pageHref(view: MediaLibraryView, page: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (view.filters.search) params.set("search", view.filters.search);
  if (view.filters.sort !== "newest") params.set("sort", view.filters.sort);
  const query = params.toString();
  return `/admin/media${query ? `?${query}` : ""}`;
}

export function MediaLibrary({ view }: Readonly<{ view: MediaLibraryView }>) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(19rem,.32fr)_minmax(0,1fr)]">
      <Card className="xl:sticky xl:top-6" padding="none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon aria-hidden="true" className="size-5" />
            <h2 className="text-lg font-semibold">Upload image</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Files are validated on the server, then uploaded securely to Cloudinary.
          </p>
        </CardHeader>
        <CardContent>
          <MediaUploadForm compact />
        </CardContent>
      </Card>

      <section aria-labelledby="media-grid-title" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="media-grid-title" className="text-xl font-semibold">Library</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.total} {view.total === 1 ? "image" : "images"}
            </p>
          </div>
          <form className="flex w-full flex-wrap gap-2 sm:w-auto" method="get">
            <label className="relative min-w-0 flex-1 sm:w-72">
              <span className="sr-only">Search media</span>
              <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={`${control} w-full ps-9`}
                defaultValue={view.filters.search}
                name="search"
                placeholder="Search images"
                type="search"
              />
            </label>
            <label>
              <span className="sr-only">Sort media</span>
              <select className={control} defaultValue={view.filters.sort} name="sort">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="largest">Largest files</option>
              </select>
            </label>
            <Button type="submit" variant="outline">Apply</Button>
          </form>
        </div>

        {view.items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {view.items.map((item) => (
              <Card className="min-w-0 overflow-hidden" key={item.id} padding="none">
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <Image
                    alt={item.altText}
                    className="object-cover transition-transform duration-200 hover:scale-[1.01] motion-reduce:transition-none"
                    fill
                    sizes="(min-width: 1536px) 320px, (min-width: 640px) 40vw, 100vw"
                    src={item.deliveryUrl}
                  />
                </div>
                <CardContent className="space-y-4">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-2 font-semibold leading-snug">{item.title}</h3>
                      {item.storyReferenceCount > 0 ? (
                        <Badge className="shrink-0" variant="secondary">
                          {item.storyReferenceCount} {item.storyReferenceCount === 1 ? "story" : "stories"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.altText}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5"><Database aria-hidden="true" className="size-3.5" /><span>{item.width && item.height ? `${item.width}×${item.height}` : "Unknown dimensions"}</span></div>
                    <div className="text-right uppercase">{item.format ?? "image"} · {formatBytes(item.bytes)}</div>
                    <div className="col-span-2 flex items-center gap-1.5"><Calendar aria-hidden="true" className="size-3.5" /><span>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.createdAt))} · {item.uploadedBy}</span></div>
                  </dl>
                  <details className="group rounded-md border border-border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      Preview and details
                    </summary>
                    <div className="space-y-4 border-t border-border p-3 text-sm">
                      <dl className="grid gap-2">
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Public ID</dt><dd className="mt-1 break-all font-mono text-xs">{item.publicId}</dd></div>
                        {item.caption ? <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Caption</dt><dd className="mt-1">{item.caption}</dd></div> : null}
                        {item.credit ? <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit</dt><dd className="mt-1">{item.credit}</dd></div> : null}
                        {item.tags.length > 0 ? <div className="flex flex-wrap gap-1.5">{item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div> : null}
                      </dl>
                      <div className="border-t border-border pt-4">
                        <h4 className="mb-3 font-medium">Replace asset</h4>
                        <MediaUploadForm
                          compact
                          mediaId={item.id}
                          initial={{
                            title: item.title,
                            altText: item.altText,
                            caption: item.caption,
                            credit: item.credit,
                            tags: item.tags,
                          }}
                        />
                      </div>
                      <form action={deleteMediaAction} className="border-t border-border pt-4">
                        <input name="id" type="hidden" value={item.id} />
                        <Button disabled={!item.canDelete} size="sm" type="submit" variant="destructive">
                          <Trash2 aria-hidden="true" />Delete image
                        </Button>
                        {!item.canDelete ? <p className="mt-2 text-xs text-muted-foreground">Remove this image from every story before deleting it.</p> : null}
                      </form>
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            align="center"
            className="min-h-72 justify-center rounded-md border border-dashed border-border"
            title={view.filters.search ? "No matching images" : "Your media library is empty"}
            description={view.filters.search
              ? "Try a different title, alt text, caption, or public ID."
              : "Upload the first newsroom image using the secure form."}
            action={view.filters.search ? <Link className="text-sm font-medium underline underline-offset-4" href="/admin/media">Clear search</Link> : undefined}
          />
        )}

        {view.totalPages > 1 ? (
          <Pagination
            currentPage={view.page}
            nextHref={view.page < view.totalPages ? pageHref(view, view.page + 1) : undefined}
            previousHref={view.page > 1 ? pageHref(view, view.page - 1) : undefined}
            totalPages={view.totalPages}
          />
        ) : null}
      </section>
    </div>
  );
}
