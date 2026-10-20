"use client";

import React from "react";

interface RealtimeIndicatorProps {
  isLive: boolean;
  className?: string;
}

export function RealtimeIndicator({ isLive, className }: RealtimeIndicatorProps) {
  return (
    <div
      className={
        className ||
        `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
          isLive
            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
        }`
      }
      title={isLive ? "Live Realtime WebSocket connected" : "Connecting to Realtime stream..."}
    >
      <span className="relative flex h-2 w-2">
        {isLive && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isLive ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
      </span>
      <span>{isLive ? "Live Delivery" : "Connecting..."}</span>
    </div>
  );
}

/**
 * ONE audio context for the whole page, reused by every chime.
 *
 * Until 2026-10-20 each chime constructed a new AudioContext and never closed
 * it, so a busy thread leaked one per message. Worse, Chrome creates a context
 * SUSPENDED -- silent -- unless the page has already had a click, tap or key
 * press, and nothing ever resumed it. A member who opened their inbox and sat
 * waiting for a reply, the one person the chime exists for, heard nothing, and
 * the try/catch below made sure nobody found out.
 *
 * So the context is created or resumed on the first gesture (which Chrome
 * allows), and resumed again before each chime in case the browser suspended
 * it in a background tab. Before any gesture there is still no sound -- no web
 * page may make one -- but the first click anywhere arms it for the rest of
 * the visit.
 */
let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  sharedContext = new AudioCtx();
  return sharedContext;
}

if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = audioContext();
    if (ctx && ctx.state === "suspended") void ctx.resume();
    if (ctx?.state === "running") {
      for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
        window.removeEventListener(event, unlock, true);
      }
    }
  };
  for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(event, unlock, { capture: true, passive: true });
  }
}

/**
 * Plays a short two-note chime through the shared context. No audio files.
 */
export function playNotificationChime() {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    // High note
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.3);

    // Harmonic resolving note
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio is a nicety; a browser that refuses it must not break delivery.
  }
}
