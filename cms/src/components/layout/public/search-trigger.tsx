import { cva } from "class-variance-authority";
import { Search } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { PublicLocale } from "./types";

const searchTriggerVariants = cva("hidden min-w-[200px] items-center sm:flex lg:w-[300px]");
const searchPanelVariants = cva("");

type SearchTriggerProps = Readonly<{
  locale: PublicLocale;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  closeLabel?: string;
  className?: string;
}>;

function SearchTrigger({
  locale,
  label = "Search",
  placeholder = "Search news",
  submitLabel = "Search",
  className,
}: SearchTriggerProps) {
  return (
    <>
      <form action={`/${locale}/search`} method="get" role="search" aria-label={label} className={cn(searchTriggerVariants(), className)}>
        <label htmlFor="header-search-query" className="sr-only">{label}</label>
        <Search className="pointer-events-none ms-3 me-[-30px] z-10 size-3.5 text-[#6e655c]" aria-hidden="true" />
        <input id="header-search-query" name="q" type="search" required maxLength={160} autoComplete="off" placeholder={placeholder} className="min-h-9 min-w-0 flex-1 rounded-[2px] border border-[#ded7cb] bg-white py-2 pe-3 ps-9 text-[12.5px] outline-none placeholder:text-[#8a7f73] focus-visible:border-[#b3261e]" />
        <button type="submit" className="sr-only">{submitLabel}</button>
      </form>
      <Link href={`/${locale}/search`} aria-label={label} className="grid size-11 place-items-center sm:hidden">
        <Search className="size-4" aria-hidden="true" />
      </Link>
    </>
  );
}

export { SearchTrigger, searchPanelVariants, searchTriggerVariants };
export type { SearchTriggerProps };
