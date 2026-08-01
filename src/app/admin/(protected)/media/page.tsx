import { redirect } from "next/navigation";

import { requireAdminUser } from "@/features/admin/auth/server";
import { MediaLibrary } from "@/features/admin/media/media-library";
import { canManageMedia } from "@/features/admin/media/media.model";
import {
  getMediaLibraryView,
  type MediaLibraryParams,
} from "@/features/admin/media/media.service";

export default async function AdminMediaPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<MediaLibraryParams & { changed?: string; error?: string }>;
}>) {
  const admin = await requireAdminUser();
  if (!canManageMedia(admin.role)) redirect("/admin/forbidden");
  const params = await searchParams;
  const view = await getMediaLibraryView(admin, params);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Editorial CMS</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Media Library</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Upload, organize, preview, replace, and reuse optimized images across INBCN stories.
        </p>
      </header>
      {params.changed ? <p className="rounded-md border border-verified/30 bg-verified/5 p-3 text-sm text-verified" role="status">The media library was updated successfully.</p> : null}
      {params.error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">The requested media operation could not be completed.</p> : null}
      <MediaLibrary view={view} />
    </div>
  );
}
