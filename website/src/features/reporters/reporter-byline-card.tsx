import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type {
  PublicReporter,
  PublicReporterStatus,
} from "./public-reporter.model";

type ReporterBylineCardProps = Readonly<{
  reporter: PublicReporter;
  href: string;
  labels: Readonly<{
    status: string;
    statusValues: Readonly<Record<PublicReporterStatus, string>>;
    district: string;
    beats: string;
    profile: string;
  }>;
}>;

export function ReporterBylineCard({
  reporter,
  href,
  labels,
}: ReporterBylineCardProps) {
  const titleId = `reporter-${reporter.slug}`;
  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-4 border-y border-[#d8d0c5] py-6 sm:grid-cols-[96px_1fr] sm:gap-5"
    >
      <div className="relative size-24 overflow-hidden rounded-full border border-[#d8d0c5] bg-[#e7e0d4]">
        <Image
          alt={reporter.legalName}
          className="object-cover"
          fill
          sizes="96px"
          src={reporter.photoUrl}
        />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="font-heading text-[22px] font-bold hover:text-[#b3261e] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e]"
            href={href}
            id={titleId}
          >
            {reporter.legalName}
          </Link>
          <Badge
            aria-label={`${labels.status}: ${labels.statusValues[reporter.status]}`}
            className="rounded-[2px]"
            variant="outline"
          >
            {labels.statusValues[reporter.status]}
          </Badge>
        </div>
        <p className="mt-1 text-[12px] text-[#6e655c]">
          {labels.district}: {reporter.district}
        </p>
        {reporter.bio ? (
          <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-[#4a423c]">
            {reporter.bio}
          </p>
        ) : null}
        {reporter.beats.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={labels.beats}>
            {reporter.beats.map((beat) => (
              <Badge className="rounded-[2px]" key={beat} variant="secondary">
                {beat}
              </Badge>
            ))}
          </div>
        ) : null}
        <Link
          className="mt-4 inline-block text-[12px] font-semibold text-[#b3261e] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b3261e]"
          href={href}
        >
          {labels.profile}
        </Link>
      </div>
    </section>
  );
}
