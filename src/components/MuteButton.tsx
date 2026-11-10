"use client";

import { useSyncExternalStore } from "react";
import { isMuted, setMuted, subscribeMuted } from "@/lib/sound";

export default function MuteButton({ className }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button
      className={className}
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Attiva i suoni" : "Disattiva i suoni"}
      aria-pressed={muted}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
