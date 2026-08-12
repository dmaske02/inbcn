import { Radio } from "lucide-react";

import { PlayerBackdrop } from "./player-backdrop";
import type { PlayerPoster } from "./player-types";

export function OfflinePlayer({ poster, message }: { poster: PlayerPoster; message: string }) {
  return (
    <div className="absolute inset-0">
      <PlayerBackdrop poster={poster} />
      <div className="absolute inset-0 grid place-items-center p-6 text-center" role="status">
        <div><Radio aria-hidden="true" className="mx-auto size-7 text-[#efb2ac]" /><p className="mt-3 text-sm font-semibold">{message}</p></div>
      </div>
    </div>
  );
}
