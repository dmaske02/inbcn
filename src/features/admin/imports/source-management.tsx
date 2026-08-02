"use client";

import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  saveNewsDataSourceAction,
  type IngestionActionState,
} from "./ingestion.actions";
import type { SourceManagementView } from "./ingestion.service";

const initialState: IngestionActionState = { status: "idle" };
const control =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

type SourceItem = SourceManagementView["sources"][number];

function SourceForm({
  source,
  references,
}: Readonly<{
  source: SourceItem | null;
  references: SourceManagementView["references"];
}>) {
  const [state, action, pending] = useActionState(
    saveNewsDataSourceAction,
    initialState,
  );
  const [languageId, setLanguageId] = useState(
    source?.defaultLanguageId ?? references.languages[0]?.id ?? "",
  );
  const categories = useMemo(
    () =>
      references.categories.filter(
        (category) => category.languageId === languageId,
      ),
    [languageId, references.categories],
  );

  return (
    <Card padding="none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {source?.name ?? "Add NewsData source"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {source
              ? "Configure the provider filters and editorial defaults."
              : "Create the source used for manual NewsData imports."}
          </p>
        </div>
        {source ? (
          <Badge variant={source.isActive ? "secondary" : "outline"}>
            {source.isActive ? "Active" : "Disabled"}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-5 md:grid-cols-2">
          <input name="id" type="hidden" value={source?.id ?? ""} />
          <label className="grid gap-2">
            <span className="text-sm font-medium">Source name</span>
            <input
              className={control}
              defaultValue={source?.name ?? "NewsData India"}
              name="name"
              required
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Slug</span>
            <input
              className={control}
              defaultValue={source?.slug ?? "newsdata-india"}
              name="slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Default language</span>
            <select
              className={control}
              name="defaultLanguageId"
              onChange={(event) => setLanguageId(event.target.value)}
              value={languageId}
            >
              {references.languages.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.name} ({language.code})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Default category</span>
            <select
              className={control}
              defaultValue={source?.defaultCategoryId ?? categories[0]?.id}
              key={languageId}
              name="defaultCategoryId"
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Country code</span>
            <input
              className={control}
              defaultValue={source?.country ?? "in"}
              maxLength={2}
              name="country"
              pattern="[A-Za-z]{2}"
              placeholder="in"
            />
            <span className="text-xs text-muted-foreground">
              Optional two-letter provider filter.
            </span>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Ingestion priority</span>
            <input
              className={control}
              defaultValue={source?.ingestionPriority ?? 50}
              max={100}
              min={1}
              name="ingestionPriority"
              required
              type="number"
            />
            <span className="text-xs text-muted-foreground">
              1 is highest priority; 100 is lowest.
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm font-medium md:col-span-2">
            <input
              className="size-4"
              defaultChecked={source?.isActive ?? true}
              name="isActive"
              type="checkbox"
            />
            Enable this source for manual imports
          </label>
          {state.message ? (
            <p
              className={
                state.status === "error"
                  ? "text-sm text-destructive md:col-span-2"
                  : "text-sm text-verified md:col-span-2"
              }
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.message}
            </p>
          ) : null}
          <div className="md:col-span-2">
            <Button disabled={pending} type="submit">
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {pending ? "Saving…" : "Save source"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SourceManagement({
  view,
}: Readonly<{ view: SourceManagementView }>) {
  return (
    <div className="space-y-5">
      {view.sources.map((source) => (
        <SourceForm
          key={source.id}
          references={view.references}
          source={source}
        />
      ))}
      <SourceForm references={view.references} source={null} />
    </div>
  );
}
