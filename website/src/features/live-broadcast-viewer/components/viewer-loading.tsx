export function ViewerLoading({ reconnecting = false }: Readonly<{ reconnecting?: boolean }>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 grid place-items-center bg-[#14110f] text-sm font-semibold text-white"
    >
      {reconnecting ? "Reconnecting to the live broadcast…" : "Loading live broadcast…"}
    </div>
  );
}
