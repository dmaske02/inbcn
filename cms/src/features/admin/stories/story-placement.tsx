import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CmsStoryDto } from "@/features/news/server";
import { getConfigurationByLocale, listSections } from "@/features/homepage-builder/homepage-builder.repository";
import { setEditorsPickAction } from "./story-placement.actions";

export async function StoryPlacement({ story, locale }: { story: CmsStoryDto; locale: string }) {
  if (locale !== "en" && locale !== "hi" && locale !== "mr") return null;
  const configuration = await getConfigurationByLocale(locale);
  const sections = configuration ? await listSections(configuration.id) : [];
  const assignments = sections.filter(section => {
    const value = section.configuration as { storyId?: string; storyIds?: string[] };
    return section.blockType === "hero-story" && value.storyId === story.id
      || section.blockType === "hero-sidebar" && value.storyIds?.includes(story.id);
  });
  return <section aria-label="Editorial placement" className="space-y-4 rounded-md border border-border bg-card p-6">
    <div><h2 className="text-lg font-semibold">Editorial placement</h2><p className="mt-1 text-sm text-muted-foreground">Publishing makes this story publicly available. Choose editorial promotion separately. Latest News, Top Headlines and Most Read retain their normal feed rules.</p></div>
    {story.status === "published" ? <form action={setEditorsPickAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={story.id} /><input type="hidden" name="expectedUpdatedAt" value={story.updatedAt} />
      <span className="text-sm">Editor’s Pick: {story.isFeatured ? "Selected" : story.editorialPlacementExplicit ? "Not selected" : "Existing homepage rules"}</span>
      <Button type="submit" name="selected" value={story.isFeatured ? "false" : "true"} variant="outline">{story.isFeatured ? "Remove Editor’s Pick" : "Add Editor’s Pick"}</Button>
      {!story.isFeatured && !story.editorialPlacementExplicit ? <Button type="submit" name="selected" value="false" variant="outline">Exclude from automatic Editor’s Picks</Button> : null}
    </form> : <p className="text-sm">Publish this story before choosing Editor’s Pick or selecting it in Homepage Builder.</p>}
    <div className="space-y-2 text-sm"><p>Hero Story and Hero Supporting Stories are managed in Homepage Builder for {locale.toUpperCase()}.</p>
      {assignments.length ? <ul className="list-inside list-disc">{assignments.map(section => <li key={section.id}>{section.blockType === "hero-story" ? "Hero Story" : "Hero Supporting Stories"}{!section.enabled ? " — disabled" : section.startsAt || section.endsAt ? " — follows the section schedule" : " — enabled"}</li>)}</ul> : <p>No explicit Hero or Supporting Story assignment.</p>}
      <Link className={buttonVariants({ variant: "outline" })} href={`/admin/homepage-builder?locale=${locale}`}>Open Homepage Builder</Link>
    </div>
  </section>;
}
