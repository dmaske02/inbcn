import { cva } from "class-variance-authority";
import { getTranslations } from "next-intl/server";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Footer } from "./footer";
import { FooterNavigation } from "./footer-navigation";
import { Header } from "./header";
import { MobileNavigation } from "./mobile-navigation";
import { PrimaryNavigation } from "./primary-navigation";
import { SearchTrigger } from "./search-trigger";
import { SkipToContent } from "./skip-to-content";
import type {
  PublicFooterGroup,
  PublicLayoutSlots,
  PublicLocale,
  PublicNavigationItem,
} from "./types";
import { UtilityBar } from "./utility-bar";
import { getPublicBreakingAlerts } from "@/features/alerts/breaking-alerts.service";
import { PublicAlerts } from "@/features/alerts/public-alerts";

const publicLayoutVariants = cva(
  "public-site flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-background text-foreground",
);

type PublicLayoutProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> &
  PublicLayoutSlots & {
    locale: PublicLocale;
    children: ReactNode;
  };

export async function PublicLayout({
  className,
  locale,
  children,
  utilityBar,
  header,
  signalRail,
  footerAdvertisement,
  footer,
  ...props
}: PublicLayoutProps) {
  const [t, alerts] = await Promise.all([getTranslations({
    locale,
    namespace: "publicLayout",
  }), getPublicBreakingAlerts(locale)]);

  const navigationItems: PublicNavigationItem[] = [
    { label: t("navigation.national"), href: `/${locale}#national` },
    { label: t("navigation.world"), href: `/${locale}#world` },
    { label: t("navigation.business"), href: `/${locale}#business` },
    { label: t("navigation.technology"), href: `/${locale}#technology` },
    { label: t("navigation.sports"), href: `/${locale}#sports` },
    {
      label: t("navigation.entertainment"),
      href: `/${locale}#entertainment`,
    },
    { label: t("navigation.opinion"), href: `/${locale}#opinion` },
  ];

  const footerCategoryItems: PublicNavigationItem[] = [
    { label: t("navigation.national"), href: `/${locale}#national` },
    { label: t("navigation.world"), href: `/${locale}#world` },
    { label: t("navigation.politics"), href: `/${locale}#politics` },
    { label: t("navigation.business"), href: `/${locale}#business` },
  ];

  const footerGroups: PublicFooterGroup[] = [
    {
      label: t("footer.explore"),
      items: [
        { label: t("navigation.latest"), href: `/${locale}#latest` },
        { label: t("actions.search"), href: `/${locale}/search` },
      ],
    },
    {
      label: t("footer.categories"),
      items: footerCategoryItems,
    },
    {
      label: t("footer.trust"),
      items: [
        { label: t("footer.about"), href: `/${locale}#about` },
        { label: t("footer.corrections"), href: `/${locale}#corrections` },
        { label: t("footer.contact"), href: `/${locale}#contact` },
      ],
    },
  ];

  return (
    <div className={cn(publicLayoutVariants(), className)} {...props}>
      <SkipToContent label={t("actions.skipToContent")} />
      {utilityBar ?? (
        <UtilityBar
          locale={locale}
          weather={t("utility.weather")}
          market={t("utility.market")}
          liveLabel={t("utility.live")}
          tagline={t("utility.tagline")}
        />
      )}
      {header ?? (
        <Header
          locale={locale}
          primaryNavigation={
            <PrimaryNavigation locale={locale} items={navigationItems} />
          }
          mobileNavigation={
            <MobileNavigation
              locale={locale}
              items={navigationItems}
              label={t("actions.menu")}
              closeLabel={t("actions.closeMenu")}
              themeLabel={t("actions.theme")}
              lightThemeLabel={t("actions.lightTheme")}
              darkThemeLabel={t("actions.darkTheme")}
            />
          }
          search={
            <SearchTrigger
              locale={locale}
              label={t("actions.search")}
              placeholder={t("actions.searchPlaceholder")}
              submitLabel={t("actions.searchSubmit")}
              closeLabel={t("actions.closeSearch")}
            />
          }
          languageLabel={t("actions.language")}
          currentLanguageLabel={t("actions.currentLanguage")}
          navigationLabel={t("actions.primaryNavigation")}
        />
      )}
      <PublicAlerts alerts={alerts} />
      {signalRail}
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      {footerAdvertisement}
      {footer ?? (
        <Footer
          locale={locale}
          description={t("footer.description")}
          navigation={
            <FooterNavigation locale={locale} groups={footerGroups} />
          }
          copyright={t("footer.copyright", {
            year: new Date().getFullYear(),
          })}
          compliance={t("footer.compliance")}
        />
      )}
    </div>
  );
}

export { publicLayoutVariants };
export type { PublicLayoutProps };
