"use client";

import { cva } from "class-variance-authority";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const shareButtonVariants = cva("");

type ShareButtonProps = {
  title: string;
  text?: string;
  url?: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
};

function ShareButton({
  title,
  text,
  url,
  label = "Share",
  copiedLabel = "Link copied",
  className,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const shareUrl = url ?? window.location.href;
    if (navigator.share) {
      await navigator.share({ title, text, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  }

  return (
    <Button
      variant="outline"
      className={cn(shareButtonVariants(), className)}
      onClick={() => void share()}
      aria-live="polite"
    >
      {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

export { ShareButton, shareButtonVariants };
