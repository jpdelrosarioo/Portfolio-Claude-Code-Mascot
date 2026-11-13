import type { ReactNode } from "react";

/** Pulsing status dot + micro label. */
export function Status({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`micro inline-flex items-center gap-2 text-g500 ${className}`}>
      <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-ink" />
      {children}
    </p>
  );
}
