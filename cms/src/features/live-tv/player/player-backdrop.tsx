import Image from "next/image";

import type { PlayerPoster } from "./player-types";

export function PlayerBackdrop({ poster }: { poster: PlayerPoster }) {
  return (
    <>
      <Image
        alt=""
        className="object-cover opacity-30"
        fill
        sizes="(min-width: 1024px) 900px, 100vw"
        src={poster.src}
        unoptimized={poster.unoptimized}
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,17,15,0.9),rgba(20,17,15,0.45))]" />
    </>
  );
}
