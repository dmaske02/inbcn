import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "./types";

export async function PrototypeFooter({ locale }: { locale: PublicLocale }) {
  const t = await getTranslations({ locale, namespace: "publicFooter" });
  return <footer className="proto-footer"><div className="proto-wrap proto-footer-grid">
    <div className="proto-footer-brand"><Image src="/images/logo/inbcn-logo.png" alt="INBCN News 24x7 Digital" width={190} height={82} /><p>{t("description")}</p><small>{t("copyright")}</small></div>
    <div><h3>{t("company.title")}</h3><Link href={`/${locale}/about`}>{t("company.about")}</Link><Link href={`/${locale}/contact`}>{t("company.contact")}</Link><Link href={`/${locale}/careers`}>{t("company.careers")}</Link></div>
    <div><h3>{t("policies.title")}</h3><Link href={`/${locale}/editorial-policy`}>{t("policies.editorial")}</Link><Link href={`/${locale}/privacy`}>{t("policies.privacy")}</Link><Link href={`/${locale}/terms`}>{t("policies.terms")}</Link></div>
    <div><h3>{t("services.title")}</h3><Link href={`/${locale}/live-tv`}>{t("services.liveTv")}</Link><Link href={`/${locale}/fact-check`}>{t("services.factCheck")}</Link><Link href={`/${locale}/newsletter`}>{t("services.newsletters")}</Link></div>
    <div><h3>{t("connect.title")}</h3><p className="proto-footer-note">{t("connect.description")}</p><form className="proto-newsletter"><input type="email" aria-label={t("connect.email")} placeholder={t("connect.email")} /><button type="submit">{t("connect.subscribe")}</button></form></div>
  </div></footer>;
}
