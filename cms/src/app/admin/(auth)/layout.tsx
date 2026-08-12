export default function AdminAuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10 sm:px-6">
      {children}
    </main>
  );
}
