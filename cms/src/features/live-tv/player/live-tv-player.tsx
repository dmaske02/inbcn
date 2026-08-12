"use client";

import { useState } from "react";
import { Play, Radio } from "lucide-react";

import type { LiveTvProgramme } from "../server/live-tv-page.model";
import { PlayerBackdrop } from "./player-backdrop";
import { PlayerFactory } from "./player-factory";
import type { PlayerLabels } from "./player-types";

export function LiveTvPlayer({
  programme,
  ariaLabel,
  liveLabel,
  labels,
}: Readonly<{
  programme: LiveTvProgramme;
  ariaLabel: string;
  liveLabel: string;
  labels: PlayerLabels;
}>) {
  const [started, setStarted] = useState(programme.playback.autoplay);
  return (
    <div aria-label={ariaLabel} className="relative aspect-video overflow-hidden border border-[#39312c] bg-[#14110f] text-white" role="group">
      {started ? (
        <PlayerFactory ariaLabel={ariaLabel} labels={labels} playback={programme.playback} poster={programme.poster} />
      ) : (
        <div className="absolute inset-0">
          <PlayerBackdrop poster={programme.poster} />
          <div className="absolute inset-0 grid place-items-center p-6 text-center sm:p-10">
            <button aria-label={labels.play} className="group grid size-16 place-items-center rounded-full border border-white/40 bg-black/35 outline-none transition hover:bg-black/55 focus-visible:ring-2 focus-visible:ring-white" onClick={() => setStarted(true)} type="button">
              <Play aria-hidden="true" className="ms-1 size-7 fill-current" />
            </button>
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-2 bg-[#b3261e] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
        <Radio aria-hidden="true" className="size-3" />{liveLabel}
      </span>
    </div>
  );
}
