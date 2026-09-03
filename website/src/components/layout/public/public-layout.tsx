import { cva } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";
import { EditorialFooter } from "./editorial-footer";
import { EditorialShell } from "./editorial-shell";
import type { HomepageViewModel } from "@/features/news/server/services/homepage.service";
import { SkipToContent } from "./skip-to-content";
import type { PublicLayoutSlots, PublicLocale } from "./types";

const publicLayoutVariants = cva(
  "public-site flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-background text-foreground",
);

type PublicLayoutProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> &
  PublicLayoutSlots & {
    locale: PublicLocale;
    homepageData?: HomepageViewModel;
    children: ReactNode;
  };

export async function PublicLayout({
  className,
  locale,
  homepageData,
  children,
  utilityBar,
  header,
  signalRail,
  footerAdvertisement,
  footer,
  ...props
}: PublicLayoutProps) {
  const t = await getTranslations({ locale, namespace: "publicChrome" });
  const currentDate = new Intl.DateTimeFormat(`${locale}-IN`, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  const chromeLabels = {
    navigation: { top: t("navigation.top"), india: t("navigation.india"), world: t("navigation.world"), politics: t("navigation.politics"), business: t("navigation.business"), technology: t("navigation.technology"), ai: t("navigation.ai"), sports: t("navigation.sports"), entertainment: t("navigation.entertainment"), health: t("navigation.health"), lifestyle: t("navigation.lifestyle"), education: t("navigation.education"), jobs: t("navigation.jobs"), opinion: t("navigation.opinion"), factCheck: t("navigation.factCheck") },
    actions: { liveTv: t("actions.liveTv"), login: t("actions.login"), openMenu: t("actions.openMenu"), closeMenu: t("actions.closeMenu"), enableAlerts: t("actions.enableAlerts"), latestUpdate: t("actions.latestUpdate"), dismiss: t("actions.dismiss") },
    utility: { tagline: t("utility.tagline"), weather: t("utility.weather"), notifications: t("utility.notifications", { count: 3 }), reportIncident: t("utility.reportIncident"), descriptor: t("utility.descriptor") },
    accessibility: { home: t("accessibility.home"), sections: t("accessibility.sections"), mobileNavigation: t("accessibility.mobileNavigation"), breakingNews: t("accessibility.breakingNews") },
    searchDialog: { open: t("searchDialog.open"), close: t("searchDialog.close"), title: t("searchDialog.title"), description: t("searchDialog.description"), placeholder: t("searchDialog.placeholder"), submit: t("searchDialog.submit") },
    breaking: t("breaking"),
    pinnedAlert: t("pinnedAlert"),
  };
  return (
    <div className={cn(publicLayoutVariants(), className)} {...props}>
      <SkipToContent label={t("accessibility.skipToContent")} />
      {utilityBar}
      {header ?? (homepageData ? <EditorialShell locale={locale} breaking={homepageData.breaking} pinnedAlert={homepageData.pinnedAlert} currentDate={currentDate} labels={chromeLabels} /> : null)}
      {signalRail}
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      {footerAdvertisement}
      {footer ?? <EditorialFooter locale={locale} />}
    </div>
  );
}

export { publicLayoutVariants };
export type { PublicLayoutProps };
