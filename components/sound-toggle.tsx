"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { isSoundOn, setSoundOn } from "@/lib/sounds";
import { Icon } from "./icons";

/** Speaker button that turns the UI sounds on or off (remembered; off by default). */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(isSoundOn());
    sync();
    window.addEventListener("sound-change", sync);
    return () => window.removeEventListener("sound-change", sync);
  }, []);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Turn sounds off" : "Turn sounds on"}
      title={on ? "Sounds on" : "Sounds off"}
      onClick={() => setSoundOn(!on)}
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-full border border-g200 bg-g50 text-g500 transition-colors duration-200 hover:text-ink aria-pressed:text-ink",
        className,
      )}
    >
      <Icon name={on ? "volume" : "volumeOff"} className="size-3.5" />
    </button>
  );
}
