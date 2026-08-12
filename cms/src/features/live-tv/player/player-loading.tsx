import { LoaderCircle } from "lucide-react";

export function PlayerLoading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center" role="status">
      <div>
        <LoaderCircle aria-hidden="true" className="mx-auto size-7 animate-spin" />
        <p className="mt-3 text-xs font-semibold text-white/80">{label}</p>
      </div>
    </div>
  );
}
