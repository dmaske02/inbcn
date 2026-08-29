import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoSans = Noto_Sans({ variable: "--font-inbcn-sans", subsets: ["latin", "devanagari"], display: "swap" });

export const metadata: Metadata = {
  title: "INBCN Reporter",
  description: "The secure INBCN workspace for field reporters.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${geistSans.variable} ${geistMono.variable} ${notoSans.variable} h-full antialiased`} lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
