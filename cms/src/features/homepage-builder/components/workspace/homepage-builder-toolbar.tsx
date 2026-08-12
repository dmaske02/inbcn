import Link from "next/link";
import type { ReactNode } from "react";
import type { HomepageEditorSaveState } from "../../editor/homepage-editor.types";
import type { HomepageLocale } from "../../homepage-builder.types";
import { HomepageEditorStatus } from "./homepage-editor-status";

const LOCALES = ["en", "hi", "mr"] as const;

export function HomepageBuilderToolbar({
  locale,
  saveStates,
  savedAtById,
  addSectionControl,
}: Readonly<{
  locale: HomepageLocale;
  saveStates: readonly HomepageEditorSaveState[];
  savedAtById: Readonly<Record<string, Date>>;
  addSectionControl?: ReactNode;
}>) {
  return (
    <header aria-label="HomepageBuilder editorial workspace" className="grid gap-4 border-b border-border pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Homepage locale" className="flex flex-wrap gap-2">
          {LOCALES.map((item) => (
            <Link
              aria-current={locale === item ? "page" : undefined}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                locale === item ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
              }`}
              href={`/admin/homepage-builder?locale=${item}`}
              key={item}
            >
              {item.toUpperCase()}
            </Link>
          ))}
        </nav>
        <HomepageEditorStatus saveStates={saveStates} savedAtById={savedAtById} />
      </div>
      {addSectionControl ? <div className="flex justify-end">{addSectionControl}</div> : null}
    </header>
  );
}
