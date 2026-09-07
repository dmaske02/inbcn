import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PublicLocale } from "./types";

export async function EditorialFooter({ locale }: { locale: PublicLocale }) {
  const t = await getTranslations({ locale, namespace: "publicFooter" });

  return (
    <footer className="editorial-footer">
      <div className="editorial-container editorial-footer-grid">
        <div className="editorial-footer-brand">
          <Link href={`/${locale}`} aria-label="INBCN News home">
            <Image src="/images/logo/inbcn-logo.png" alt="INBCN News 24x7 Digital" width={190} height={82} />
          </Link>
          <p>{t("description")}</p>
          <small>{t("copyright")}</small>
        </div>

        <nav aria-label={t("company.title")}>
          <h2>{t("company.title")}</h2>
          <Link href={`/${locale}/about`}>{t("company.about")}</Link>
          <Link href={`/${locale}/contact`}>{t("company.contact")}</Link>
          <Link href={`/${locale}/careers`}>{t("company.careers")}</Link>
        </nav>

        <nav aria-label={t("policies.title")}>
          <h2>{t("policies.title")}</h2>
          <Link href={`/${locale}/editorial-policy`}>{t("policies.editorial")}</Link>
          <Link href={`/${locale}/privacy`}>{t("policies.privacy")}</Link>
          <Link href={`/${locale}/terms`}>{t("policies.terms")}</Link>
        </nav>

        <nav aria-label={t("services.title")}>
          <h2>{t("services.title")}</h2>
          <Link href={`/${locale}/live-tv`}>{t("services.liveTv")}</Link>
          <Link href={`/${locale}/fact-check`}>{t("services.factCheck")}</Link>
          <Link href={`/${locale}/newsletter`}>{t("services.newsletters")}</Link>
        </nav>

        <div className="editorial-footer-connect">
          <h2>{t("connect.title")}</h2>
          <p>{t("connect.description")}</p>
          <form className="editorial-footer-newsletter">
            <label htmlFor="editorial-footer-email" className="sr-only">{t("connect.email")}</label>
            <input
              id="editorial-footer-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder={t("connect.email")}
            />
            <button type="submit">{t("connect.subscribe")}</button>
          </form>
        </div>
      </div>
    </footer>
  );
}
