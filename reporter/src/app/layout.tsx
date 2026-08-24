import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INBCN Reporter — Client Preview",
  description: "A synthetic preview of the INBCN mobile field reporter experience.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
