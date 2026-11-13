"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
type Origin = { x: number; y: number };

type ThemeContextValue = {
  choice: ThemeChoice;
  setTheme: (choice: ThemeChoice, origin?: Origin) => void;
  cycleTheme: (origin?: Origin) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const ORDER: ThemeChoice[] = ["system", "light", "dark"];

function readChoice(): ThemeChoice {
  try {
    const c = localStorage.getItem("theme");
    if (c === "light" || c === "dark" || c === "system") return c;
  } catch {}
  return "system";
}

function resolve(choice: ThemeChoice) {
  return choice === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
}

function paint(choice: ThemeChoice) {
  const root = document.documentElement;
  root.dataset.theme = resolve(choice);
  root.dataset.themeChoice = choice;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  // Sync with what the pre-paint script already applied
  useEffect(() => {
    setChoice(readChoice());
  }, []);

  // Follow the OS while on "system"
  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => paint("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const setTheme = useCallback((next: ThemeChoice, origin?: Origin) => {
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setChoice(next);

    const root = document.documentElement;
    const changing = resolve(next) !== root.dataset.theme;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!changing || reduce) {
      paint(next);
      return;
    }

    // Circular reveal from the click point where view transitions exist
    if (origin && "startViewTransition" in document) {
      const { x, y } = origin;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add("vt");
      const vt = document.startViewTransition(() => paint(next));
      vt.ready
        .then(() => {
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: 540, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
          );
        })
        .catch(() => {});
      vt.finished.finally(() => root.classList.remove("vt"));
      return;
    }

    // Fallback: 500ms colour crossfade
    root.classList.add("theme-fading");
    paint(next);
    setTimeout(() => root.classList.remove("theme-fading"), 520);
  }, []);

  const cycleTheme = useCallback(
    (origin?: Origin) => setTheme(ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length], origin),
    [choice, setTheme],
  );

  const value = useMemo(() => ({ choice, setTheme, cycleTheme }), [choice, setTheme, cycleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
