import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans, Noto_Serif, Noto_Serif_Devanagari } from "next/font/google";
import { getLocale } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSans = Noto_Sans({
  variable: "--font-inbcn-sans",
  subsets: ["latin", "devanagari"],
  display: "swap",
});

const notoSerif = Noto_Serif({
  variable: "--font-inbcn-serif",
  subsets: ["latin"],
  display: "swap",
});

const notoSerifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-inbcn-serif-devanagari",
  subsets: ["devanagari"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "INBCN Digital News",
  description: "Trusted multilingual news for India in English, Hindi and Marathi.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSans.variable} ${notoSerif.variable} ${notoSerifDevanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
