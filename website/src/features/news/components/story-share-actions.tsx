"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

type StoryShareActionsProps = Readonly<{
  title: string;
  url: string;
  labels: Readonly<{ whatsapp: string; copy: string; copied: string; x: string; facebook: string; linkedin: string; telegram?: string; email: string }>;
  placement?: "inline" | "desktop" | "mobile";
}>;

export function StoryShareActions({ title, url, labels, placement = "inline" }: StoryShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const links = [
    { label: labels.whatsapp, href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`, icon: <span aria-hidden="true" className="font-semibold">WA</span> },
    { label: labels.x, href: `https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`, icon: <span aria-hidden="true" className="font-semibold">X</span> },
    { label: labels.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: <span aria-hidden="true" className="font-semibold">f</span> },
    { label: labels.linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, icon: <span aria-hidden="true" className="font-semibold">in</span> },
    { label: labels.telegram ?? "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`, icon: <span aria-hidden="true" className="font-semibold">TG</span> },
    { label: labels.email, href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`, icon: <Mail aria-hidden="true" /> },
  ];

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  const placementClass = placement === "desktop"
    ? "sticky top-24 hidden flex-col gap-2 lg:flex"
    : placement === "mobile"
      ? "fixed inset-x-3 bottom-3 z-50 flex gap-1 overflow-x-auto border border-[#d8d0c5] bg-[#fbf9f5]/95 p-2 shadow-lg backdrop-blur lg:hidden"
      : "flex flex-wrap gap-2";

  return (
    <div className={placementClass} aria-label="Share this article">
      {links.map((link) => (
        <a key={link.label} className={buttonVariants({ variant: "outline", size: "sm" })} href={link.href} target={link.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
          {link.icon}{link.label}
        </a>
      ))}
      <Button aria-live="polite" onClick={() => void copyLink()} variant="outline" size="sm">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? labels.copied : labels.copy}
      </Button>
    </div>
  );
}
