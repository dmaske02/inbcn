import { randomUUID } from "node:crypto";

import { requireReporterSession } from "@/features/auth/server";
import { saveReporterDraftAction } from "@/features/submissions/submission.actions";
import { SubmissionButton, SubmissionForm } from "@/features/submissions/submission-form";
import { createNewReporterDraftTarget } from "@/features/submissions/submission.model";
import { getReporterStoryReferences } from "@/features/submissions/submission.repository";

const fieldClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

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
      <SubmissionForm action={saveReporterDraftAction.bind(null, draftTarget)} className="space-y-4 rounded-lg border border-border bg-background p-5 shadow-sm sm:p-6">
        <label className="block text-sm font-medium">Headline
          <input className={fieldClass} maxLength={240} name="title" required />
        </label>
        <label className="block text-sm font-medium">Summary
          <textarea className={fieldClass} maxLength={1000} name="summary" required rows={3} />
        </label>
        <label className="block text-sm font-medium">Body
          <textarea className={fieldClass} name="body" required rows={10} />
        </label>
        <label className="block text-sm font-medium">Language
          <select className={fieldClass} name="language" required>
            <option value="">Choose a language</option>
            {references.languages.map((language) => (
              <option key={language.id} value={`${language.id}:${language.code}`}>{language.nativeName}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">Category
          <select className={fieldClass} name="categoryId" required>
            <option value="">Choose a category</option>
            {references.categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">Event time (India time)
          <input className={fieldClass} name="eventOccurredAt" required type="datetime-local" />
        </label>
        <SubmissionButton className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60">Save draft</SubmissionButton>
      </SubmissionForm>
    </div>
  );
}
