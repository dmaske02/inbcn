"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { useState } from "react";

import type { PublicLocale } from "./types";
import type { HomepagePinnedAlert, HomepageStory } from "@/features/news/server/services/homepage.service";
import { localizePublicPath, routing } from "@/i18n/routing";

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

type PrototypeChromeProps = {
  locale: PublicLocale;
  breaking: readonly HomepageStory[];
  pinnedAlert: HomepagePinnedAlert | null;
  currentDate: string;
  labels: PrototypeChromeLabels;
};

export type PrototypeChromeLabels = Readonly<{
  navigation: Readonly<Record<(typeof categories)[number]["key"], string>>;
  actions: Readonly<{ liveTv: string; login: string; signup: string; searchPlaceholder: string; openMenu: string; closeMenu: string; enableAlerts: string; latestUpdate: string; dismiss: string }>;
  utility: Readonly<{ tagline: string; weather: string; notifications: string; reportIncident: string; descriptor: string }>;
  accessibility: Readonly<{ home: string; sections: string; mobileNavigation: string; breakingNews: string }>;
  breaking: string;
  pinnedAlert: string;
}>;

export function PrototypeChrome({ locale, breaking, pinnedAlert, currentDate, labels }: PrototypeChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const tickerItems = [...breaking, ...breaking];

  return (
    <>
      <div className="proto-top-strip">
        <div className="proto-wrap proto-strip-inner">
          <div className="proto-strip-left">
            <span>{currentDate}</span><span className="proto-divider" />
            <span>{labels.utility.tagline}</span>
          </div>
          <div className="proto-strip-right">
            <span className="proto-utility-pill"><i />{labels.utility.weather}</span>
            <button className="proto-utility-pill">{labels.utility.notifications}</button>
            {routing.locales.map((nextLocale) => <button key={nextLocale} type="button" className={`proto-locale ${nextLocale === locale ? "active" : ""}`} onClick={() => router.push(localizePublicPath(pathname, nextLocale, window.location.search, window.location.hash))}>{nextLocale.toUpperCase()}</button>)}
            <button className="proto-report"><i />{labels.utility.reportIncident}</button>
          </div>
        </div>
      </div>

      <header className="proto-masthead">
        <div className="proto-wrap">
          <div className="proto-brand-row">
            <div className="proto-brand-lockup">
              <Link href={`/${locale}`} className="proto-brand" aria-label={labels.accessibility.home}>
                <Image src="/images/logo/inbcn-logo.png" alt="INBCN News 24x7 Digital" width={1494} height={648} priority />
              </Link>
              <div className="proto-descriptor">{labels.utility.descriptor}</div>
            </div>
            <div className="proto-header-actions">
              <form className="proto-search" action={`/${locale}/search`}><Search size={14} aria-hidden="true" /><input name="q" aria-label={labels.actions.searchPlaceholder} placeholder={labels.actions.searchPlaceholder} /></form>
              <Link className="proto-live-tv" href={`/${locale}/live-tv`}><i />{labels.actions.liveTv}</Link>
              <button className="proto-auth secondary">{labels.actions.login}</button>
              <button className="proto-auth">{labels.actions.signup}</button>
              <button className="proto-menu" aria-label={labels.actions.openMenu} onClick={() => setDrawerOpen(true)}><Menu size={18} /></button>
            </div>
          </div>
          <nav className="proto-nav" aria-label={labels.accessibility.sections}>
            {categories.map((item) => <Link key={item.key} className={item.key === "top" ? "active" : ""} href={navigationHref(locale, item.path)}>{labels.navigation[item.key]}</Link>)}
          </nav>
        </div>
      </header>

      {drawerOpen && <div className="proto-drawer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDrawerOpen(false); }}>
        <div className="proto-drawer-panel" role="dialog" aria-modal="true" aria-label={labels.accessibility.mobileNavigation}>
          <div className="proto-drawer-head"><Image src="/images/logo/inbcn-logo.png" alt="INBCN News 24x7 Digital" width={170} height={74} /><button className="proto-icon" aria-label={labels.actions.closeMenu} onClick={() => setDrawerOpen(false)}><X size={18} /></button></div>
          <form className="proto-search proto-drawer-search" action={`/${locale}/search`}><Search size={14} /><input name="q" placeholder={labels.actions.searchPlaceholder} aria-label={labels.actions.searchPlaceholder} /></form>
          <div className="proto-drawer-links">
            <Link className="proto-live-tv proto-drawer-live-tv" href={navigationHref(locale, "live-tv")} onClick={() => setDrawerOpen(false)}><i />{labels.actions.liveTv}</Link>
            {categories.map((item) => <Link key={item.key} href={navigationHref(locale, item.path)} onClick={() => setDrawerOpen(false)}>{labels.navigation[item.key]}</Link>)}
          </div>
          <div className="proto-drawer-actions"><button className="proto-auth secondary">{labels.actions.login}</button><button className="proto-auth">{labels.actions.signup}</button></div>
        </div>
      </div>}

      {breaking.length > 0 && <section className="proto-ticker" aria-label={labels.accessibility.breakingNews}>
        <div className="proto-wrap proto-ticker-inner">
          <div className="proto-ticker-label">{labels.breaking}</div>
          <div className="proto-ticker-viewport"><div className="proto-ticker-track">{tickerItems.map((story, index) => <Link href={story.href} key={`${story.id}-${index}`}>{story.title}</Link>)}</div></div>
          <div className="proto-ticker-actions"><button>{labels.actions.enableAlerts}</button><button onClick={() => { window.location.href = breaking[0].href; }}>{labels.actions.latestUpdate}</button></div>
        </div>
      </section>}

      {pinnedAlert && pinnedOpen && <section className="proto-breaking-surfaces" aria-live="polite">
        <div className="proto-wrap proto-breaking-stack"><div className="proto-pinned-alert">
          <div className="proto-label">{labels.pinnedAlert}</div><div><div className="proto-alert-title">{pinnedAlert.title}</div><div className="proto-alert-body">{pinnedAlert.message}</div></div>
          {pinnedAlert.dismissible && <button className="proto-alert-close" onClick={() => setPinnedOpen(false)}>{labels.actions.dismiss}</button>}
        </div></div>
      </section>}
    </>
  );
}
