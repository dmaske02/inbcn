import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export default async function ReporterNotFound() {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("reporters.notFound"),
  ]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-[#6e655c]">{t("description")}</p>
      <Link
        className="mt-6 inline-block font-semibold text-[#b3261e] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e]"
        href={`/${locale}`}
      >
        {t("home")}
      </Link>
    </div>
  );
}
