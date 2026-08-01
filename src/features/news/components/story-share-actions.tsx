"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

type StoryShareActionsProps = Readonly<{
  title: string;
  url: string;
  labels: Readonly<{ copy: string; copied: string; x: string; facebook: string; linkedin: string; email: string }>;
}>;

export function StoryShareActions({ title, url, labels }: StoryShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const links = [
    { label: labels.x, href: `https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`, icon: <span aria-hidden="true" className="font-semibold">X</span> },
    { label: labels.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: <span aria-hidden="true" className="font-semibold">f</span> },
    { label: labels.linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, icon: <span aria-hidden="true" className="font-semibold">in</span> },
    { label: labels.email, href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`, icon: <Mail aria-hidden="true" /> },
  ];

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button aria-live="polite" onClick={() => void copyLink()} variant="outline">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? labels.copied : labels.copy}
      </Button>
      {links.map((link) => (
        <a key={link.label} className={buttonVariants({ variant: "outline" })} href={link.href} target={link.href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
          {link.icon}{link.label}
        </a>
      ))}
    </div>
  );
}
