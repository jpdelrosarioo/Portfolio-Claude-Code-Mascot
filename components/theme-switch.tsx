"use client";

import type { MouseEvent } from "react";
import { Icon, type IconName } from "./icons";
import { useTheme, type ThemeChoice } from "./theme-provider";

const OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "system", label: "System theme", icon: "monitor" },
  { value: "light", label: "Light theme", icon: "sun" },
  { value: "dark", label: "Dark theme", icon: "moon" },
];

const origin = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });

/** Pill with three icon buttons: system · light · dark. `compact` is the tighter size used in the sidebar. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { choice, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label="Theme"
      className={`flex w-fit rounded-full border border-g200 bg-g50 p-0.5 ${compact ? "gap-px" : ""}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={o.label}
          aria-pressed={choice === o.value}
          onClick={(e) => setTheme(o.value, origin(e))}
          className={`grid place-items-center rounded-full text-g500 transition-colors duration-200 hover:text-ink aria-pressed:bg-ink aria-pressed:text-bg ${
            compact ? "size-[22px]" : "size-7"
          }`}
        >
          <Icon name={o.icon} className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Compact button that cycles system → light → dark (used in the mobile top bar). */
export function ThemeCycle() {
  const { choice, cycleTheme } = useTheme();
  const icon: IconName = choice === "light" ? "sun" : choice === "dark" ? "moon" : "monitor";
  return (
    <button
      type="button"
      onClick={(e) => cycleTheme(origin(e))}
      aria-label={`Theme: ${choice}. Click to change.`}
      className="grid size-9 place-items-center text-g500 transition-colors duration-200 hover:text-ink max-lg:size-11"
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
}
