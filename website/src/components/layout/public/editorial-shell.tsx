"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { HomepagePinnedAlert, HomepageStory } from "@/features/news/server/services/homepage.service";
import { localizePublicPath } from "@/i18n/routing";
import { SearchDialog, type SearchDialogLabels } from "./search-dialog";
import type { PublicLocale } from "./types";

const categories = [
  { key: "top", path: "" },
  { key: "india", path: "category/national" },
  { key: "world", path: "category/world" },
  { key: "politics", path: "category/politics" },
  { key: "business", path: "category/business" },
  { key: "technology", path: "category/technology" },
  { key: "ai", path: "search?q=AI" },
  { key: "sports", path: "category/sports" },
  { key: "entertainment", path: "category/entertainment" },
  { key: "health", path: "category/health" },
  { key: "lifestyle", path: "category/lifestyle" },
  { key: "education", path: "category/education" },
  { key: "jobs", path: "search?q=Jobs" },
  { key: "opinion", path: "search?q=Opinion" },
  { key: "factCheck", path: "search?q=Fact+Check" },
] as const;

const navigationHref = (locale: PublicLocale, path: string) =>
  path ? `/${locale}/${path}` : `/${locale}`;

export type EditorialShellLabels = Readonly<{
  navigation: Readonly<Record<(typeof categories)[number]["key"], string>>;
  actions: Readonly<{
    liveTv: string;
    login: string;
    openMenu: string;
    closeMenu: string;
    enableAlerts: string;
    latestUpdate: string;
    dismiss: string;
  }>;
  utility: Readonly<{
    tagline: string;
    weather: string;
    notifications: string;
    reportIncident: string;
    descriptor: string;
  }>;
  accessibility: Readonly<{
    home: string;
    sections: string;
    mobileNavigation: string;
    breakingNews: string;
  }>;
  searchDialog: SearchDialogLabels;
  breaking: string;
  pinnedAlert: string;
}>;

type EditorialShellProps = Readonly<{
  locale: PublicLocale;
  breaking: readonly HomepageStory[];
  pinnedAlert: HomepagePinnedAlert | null;
  currentDate: string;
  labels: EditorialShellLabels;
}>;

export function EditorialShell({
  locale,
  breaking,
  pinnedAlert,
  currentDate,
  labels,
}: EditorialShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const tickerItems = [...breaking, ...breaking];

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  function openDrawer() {
    if (!drawerRef.current?.open) drawerRef.current?.showModal();
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (drawerRef.current?.open) drawerRef.current.close();
  }

  function handleDrawerClose() {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => drawerTriggerRef.current?.focus());
  }

  function switchLocale(nextLocale: PublicLocale) {
    router.push(
      localizePublicPath(pathname, nextLocale, window.location.search, window.location.hash),
    );
  }

  return (
    <>
      <div className="editorial-shell">
        <header className="editorial-shell-masthead">
          <div className="editorial-container editorial-shell-main">
            <Link href={`/${locale}`} className="editorial-shell-brand" aria-label={labels.accessibility.home}>
              <Image
                src="/images/logo/inbcn-logo.png"
                alt="INBCN News 24x7 Digital"
                width={1494}
                height={648}
                priority
              />
            </Link>

            <nav className="editorial-shell-nav" aria-label={labels.accessibility.sections}>
              {categories.map((item) => {
                const href = navigationHref(locale, item.path);
                const pathOnly = href.split("?")[0];
                const active = item.key === "top"
                  ? pathname === `/${locale}`
                  : item.path.startsWith("category/") && pathname === pathOnly;
                return (
                  <Link key={item.key} href={href} aria-current={active ? "page" : undefined}>
                    {labels.navigation[item.key]}
                  </Link>
                );
              })}
            </nav>

            <div className="editorial-shell-actions">
              <Link className="editorial-shell-live" href={`/${locale}/live-tv`}>
                <span aria-hidden="true" />
                {labels.actions.liveTv}
              </Link>
              <SearchDialog locale={locale} labels={labels.searchDialog} />
              <button type="button" className="editorial-shell-sign-in">
                {labels.actions.login}
              </button>
              <button
                ref={drawerTriggerRef}
                type="button"
                className="editorial-drawer-trigger"
                aria-label={labels.actions.openMenu}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                onClick={openDrawer}
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="editorial-edition-strip">
          <div className="editorial-container editorial-edition-inner">
            <div className="editorial-edition-copy">
              <time>{currentDate}</time>
              <span aria-hidden="true" />
              <strong>{labels.utility.descriptor}</strong>
            </div>
            <div className="editorial-edition-tools">
              <span className="editorial-weather">{labels.utility.weather}</span>
              <button type="button" className="editorial-edition-action">
                <Bell aria-hidden="true" className="size-3.5" />
                {labels.utility.notifications}
              </button>
              <div className="editorial-locales" aria-label="Language">
                {(["EN", "HI", "MR"] as const).map((item) => {
                  const nextLocale = item.toLowerCase() as PublicLocale;
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={nextLocale === locale}
                      onClick={() => switchLocale(nextLocale)}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              <button type="button" className="editorial-report-action">
                <span aria-hidden="true" />
                {labels.utility.reportIncident}
              </button>
            </div>
          </div>
        </div>
      </div>

      <dialog
        ref={drawerRef}
        className="editorial-drawer"
        aria-label={labels.accessibility.mobileNavigation}
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClose={handleDrawerClose}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <div className="editorial-drawer-panel">
          <div className="editorial-drawer-head">
            <Image src="/images/logo/inbcn-logo.png" alt="INBCN News 24x7 Digital" width={170} height={74} />
            <button type="button" aria-label={labels.actions.closeMenu} onClick={closeDrawer}>
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <nav className="editorial-drawer-links" aria-label={labels.accessibility.mobileNavigation}>
            <Link className="editorial-drawer-live" href={navigationHref(locale, "live-tv")} onClick={closeDrawer}>
              <Radio aria-hidden="true" className="size-4" />
              {labels.actions.liveTv}
            </Link>
            {categories.map((item) => (
              <Link key={item.key} href={navigationHref(locale, item.path)} onClick={closeDrawer}>
                {labels.navigation[item.key]}
              </Link>
            ))}
          </nav>
          <button type="button" className="editorial-drawer-sign-in">
            {labels.actions.login}
          </button>
        </div>
      </dialog>

      {breaking.length > 0 ? (
        <section className="editorial-breaking" aria-label={labels.accessibility.breakingNews}>
          <div className="editorial-container editorial-breaking-inner">
            <strong className="editorial-breaking-label">{labels.breaking}</strong>
            <div className="editorial-breaking-viewport">
              <div className="editorial-breaking-track">
                {tickerItems.map((story, index) => (
                  <Link href={story.href} key={`${story.id}-${index}`}>{story.title}</Link>
                ))}
              </div>
            </div>
            <div className="editorial-breaking-actions">
              <button type="button">{labels.actions.enableAlerts}</button>
              <button type="button" onClick={() => { window.location.href = breaking[0].href; }}>
                {labels.actions.latestUpdate}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {pinnedAlert && pinnedOpen ? (
        <section className="editorial-pinned" aria-live="polite">
          <div className="editorial-container editorial-pinned-inner">
            <span className="editorial-pinned-label">{labels.pinnedAlert}</span>
            <div>
              <strong>{pinnedAlert.title}</strong>
              <p>{pinnedAlert.message}</p>
            </div>
            {pinnedAlert.dismissible ? (
              <button type="button" onClick={() => setPinnedOpen(false)}>{labels.actions.dismiss}</button>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
