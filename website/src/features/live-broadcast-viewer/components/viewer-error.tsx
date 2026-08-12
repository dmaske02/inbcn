export function ViewerError({ onShowOffline }: Readonly<{ onShowOffline(): void }>) {
  return (
    <div
      role="alert"
      className="absolute inset-0 grid place-items-center bg-[#14110f] p-6 text-center text-white"
    >
      <div>
        <p className="font-semibold">The live broadcast is unavailable.</p>
        <button
          type="button"
          onClick={onShowOffline}
          className="mt-4 min-h-11 border border-white/60 px-4 text-sm font-semibold outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#14110f]"
        >
          Show offline page
        </button>
      </div>
    </div>
  );
}
