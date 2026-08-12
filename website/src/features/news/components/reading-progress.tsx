"use client";

import { useEffect, useState } from "react";

export function ReadingProgress({ articleId }: Readonly<{ articleId: string }>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const article = document.getElementById(articleId);
      if (!article) return;
      const start = article.offsetTop;
      const distance = Math.max(1, article.offsetHeight - window.innerHeight);
      const value = Math.min(100, Math.max(0, ((window.scrollY - start) / distance) * 100));
      setProgress(Math.round(value));
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      cancelAnimationFrame(frame);
    };
  }, [articleId]);

  const visible = progress > 0 && progress < 100;
  return (
    <div
      role="progressbar"
      aria-label="Article reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      className={`fixed inset-x-0 top-0 z-[100] h-[3px] bg-transparent transition-opacity duration-200 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="h-full bg-[#b3261e] transition-[width] duration-150 ease-out" style={{ width: `${progress}%` }} />
    </div>
  );
}
