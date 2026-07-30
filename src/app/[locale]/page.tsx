import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const app = await getTranslations("app");
  const home = await getTranslations("home");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl space-y-6 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          {locale}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {app("title")}
        </h1>
        <h2 className="text-2xl font-medium">{home("welcome")}</h2>
        <p className="text-lg text-muted-foreground">{home("description")}</p>
      </div>
    </main>
  );
}
