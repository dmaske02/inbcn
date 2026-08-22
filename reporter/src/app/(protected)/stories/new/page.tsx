import { randomUUID } from "node:crypto";

import { requireReporterSession } from "@/features/auth/server";
import { saveReporterDraftAction } from "@/features/submissions/submission.actions";
import { createNewReporterDraftTarget } from "@/features/submissions/submission.model";
import { getReporterStoryReferences } from "@/features/submissions/submission.repository";
import { StoryEditor } from "@/features/submissions/story-editor";

export default async function NewReporterStoryPage() {
  const actor = await requireReporterSession();
  if (actor.state !== "reporter") {
    return <p className="text-sm text-muted-foreground">Story tools become available after reporter approval.</p>;
  }
  const references = await getReporterStoryReferences();
  const draftTarget = createNewReporterDraftTarget(randomUUID);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">New story</h1>
        <p className="mt-2 text-sm text-muted-foreground">Save canonical story details before adding verified media and submitting.</p>
      </header>
      <StoryEditor
        editable
        isPersisted={false}
        canDirectPublish={false}
        canSubmit={false}
        media={[]}
        references={references}
        saveAction={saveReporterDraftAction.bind(null, draftTarget)}
        story={{ title: "", summary: "", body: "", languageId: "", categoryId: "", eventOccurredAt: "", featuredMediaId: null, updatedAt: new Date().toISOString() }}
        storyId={draftTarget.storyId}
        storageStoryId="new"
        userId={actor.userId}
      />
    </div>
  );
}
