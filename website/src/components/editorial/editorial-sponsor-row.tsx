import { cn } from "@/lib/utils";

type EditorialSponsorRowProps = Readonly<{
  label: string;
  slotId?: string;
  className?: string;
}>;

export function EditorialSponsorRow({ label, slotId, className }: EditorialSponsorRowProps) {
  return (
    <aside
      aria-label={label}
      className={cn("editorial-sponsor-row", className)}
      data-ad-slot={slotId}
    >
      <span>{label}</span>
      <small>Reserved sponsor placement</small>
    </aside>
  );
}
