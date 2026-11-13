"use client";

import { createElement, useEffect, useRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";

/* One shared observer. Elements that scroll into view in the same frame are
   staggered 70ms apart (first at 50ms, capped at 330ms). */
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer) return observer;
  const io = new IntersectionObserver(
    (entries) => {
      entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        .forEach((entry, i) => {
          const el = entry.target as HTMLElement;
          el.style.setProperty("--d", `${Math.min(50 + i * 70, 330)}ms`);
          el.dataset.in = "true";
          io.unobserve(el);
        });
    },
    { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
  );
  observer = io;
  return io;
}

type RevealProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/** Fades its child up 12px on first entering the viewport. Fully visible with reduced motion or no JS. */
export function Reveal<T extends ElementType = "div">({ as, className, children, ...rest }: RevealProps<T>) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.in = "true";
      return;
    }
    const io = getObserver();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return createElement(as ?? "div", { ref, className: `reveal ${className ?? ""}`.trim(), ...rest }, children);
}
