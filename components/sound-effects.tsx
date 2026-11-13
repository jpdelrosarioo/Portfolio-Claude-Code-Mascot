"use client";

import { useEffect } from "react";
import { play } from "@/lib/sounds";

/** Soft click sound on links, buttons and menu options (only when the visitor has sounds on). */
export function SoundEffects() {
  useEffect(() => {
    let last = 0;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.("a[href], button, [role='option'], summary")) return;
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      play("tick");
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return null;
}
