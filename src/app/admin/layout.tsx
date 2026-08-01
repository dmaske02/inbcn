import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "INBCN Editorial",
    template: "%s | INBCN Editorial",
  },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-svh bg-muted/25 text-foreground">{children}</div>;
}
