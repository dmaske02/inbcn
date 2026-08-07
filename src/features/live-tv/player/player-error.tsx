import { CircleAlert } from "lucide-react";

export function PlayerError({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center" role="alert">
      <div className="max-w-sm">
        <CircleAlert aria-hidden="true" className="mx-auto size-8 text-[#efb2ac]" />
        <p className="mt-3 text-sm font-semibold text-white">{message}</p>
      </div>
    </div>
  );
}
