"use client";

import { Bookmark, Check, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const SAVED_STORY_IDS_KEY = "inbcn:saved-story-ids:v1";
const SAVED_STORIES_CHANGE_EVENT = "inbcn:saved-stories-change";

type StoryActionButtonsProps = Readonly<{
  storyId: string;
  title: string;
  url: string;
}>;

function readSavedStoryIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SAVED_STORY_IDS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function subscribeToSavedStories(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SAVED_STORIES_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SAVED_STORIES_CHANGE_EVENT, onStoreChange);
  };
}

function getServerSavedSnapshot() {
  return false;
}

export function StoryActionButtons({ storyId, title, url }: StoryActionButtonsProps) {
  const saved = useSyncExternalStore(
    subscribeToSavedStories,
    () => readSavedStoryIds().includes(storyId),
    getServerSavedSnapshot,
  );
  const [shareStatus, setShareStatus] = useState("");

  function toggleSaved() {
    const ids = new Set(readSavedStoryIds());
    if (ids.has(storyId)) ids.delete(storyId);
    else ids.add(storyId);

    try {
      window.localStorage.setItem(SAVED_STORY_IDS_KEY, JSON.stringify([...ids]));
      window.dispatchEvent(new Event(SAVED_STORIES_CHANGE_EVENT));
    } catch {
      return;
    }
  }

  async function copyUrl() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied");
      return;
    }
    window.prompt("Copy this story link", url);
  }

  async function shareStory() {
    setShareStatus("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        setShareStatus("Story shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await copyUrl();
    } catch {
      window.prompt("Copy this story link", url);
    }
  }

  return (
    <div className="editorial-story-actions">
      <button
        type="button"
        aria-label={saved ? "Remove from saved stories" : "Save story"}
        aria-pressed={saved}
        onClick={toggleSaved}
      >
        {saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        <span>{saved ? "Saved" : "Save"}</span>
      </button>
      <button type="button" aria-label="Share story" onClick={() => void shareStory()}>
        <Share2 aria-hidden="true" />
        <span>Share</span>
      </button>
      <span className="sr-only" aria-live="polite">{shareStatus}</span>
    </div>
  );
}
