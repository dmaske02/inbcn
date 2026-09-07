import Link from "next/link";
import type { HomepageEditorSaveState } from "../../editor/homepage-editor.types";
import type { HomepageLocale } from "../../homepage-builder.types";
import { HomepageEditorStatus } from "./homepage-editor-status";

const LOCALES = ["hi", "en", "mr"] as const;

export function HomepageBuilderToolbar({
  locale,
  saveStates,
  savedAtById,
}: Readonly<{
  locale: HomepageLocale;
  saveStates: readonly HomepageEditorSaveState[];
  savedAtById: Readonly<Record<string, Date>>;
}>) {
  return (
    <header aria-label="HomepageBuilder editorial workspace" className="sticky top-0 z-30 border-b border-border bg-background/95 py-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-52">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Homepage management</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Homepage Builder</h1>
          <p className="text-sm text-muted-foreground">Compose and arrange the homepage</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <nav aria-label="Homepage locale" className="flex border border-border bg-background p-1">
            {LOCALES.map((item) => (
              <Link
                aria-current={locale === item ? "page" : undefined}
                className={`px-3 py-2 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
      </div>
    </header>
  );
}
