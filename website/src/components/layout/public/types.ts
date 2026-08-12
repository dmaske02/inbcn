import type { ReactNode } from "react";

import type { routing } from "@/i18n/routing";

export type PublicLocale = (typeof routing.locales)[number];

export type PublicNavigationItem = {
  label: string;
  href: string;
};

export type PublicFooterGroup = {
  label: string;
  items: readonly PublicNavigationItem[];
};

export type PublicLayoutSlots = {
  utilityBar?: ReactNode;
  header?: ReactNode;
  signalRail?: ReactNode;
  footerAdvertisement?: ReactNode;
  footer?: ReactNode;
};
