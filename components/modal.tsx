"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { play } from "@/lib/sounds";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * bryl-minimal modal: full-viewport overlay (ink at 30% with a strong blur) and a centred panel that
 * fades and scales from 95% to 100% over 200ms. Escape closes; Tab stays inside; focus returns on close.
 */
export function Modal({
  open,
  onClose,
  label,
  size = "sm",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const wasOpen = useRef(false);

  // Mount / fade in, fade out / unmount
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      wasOpen.current = true;
      setMounted(true);
      play("open");
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      play("close");
      (returnFocus.current as HTMLElement | null)?.focus?.();
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Once the content is on screen, focus the input marked data-autofocus (or the first focusable element)
  useEffect(() => {
    if (!mounted || !open) return;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [mounted, open]);

  // Lock page scroll while visible
  useEffect(() => {
    if (!mounted) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted]);

  // Escape closes; Tab is trapped inside the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={cx(
        "fixed inset-0 z-[70] grid place-items-start justify-items-center px-4 pt-[12vh] transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-ink/30 backdrop-blur-md" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cx(
          "w-full rounded-2xl border border-g200 bg-bg p-3 shadow-[0_40px_90px_-20px_rgb(0_0_0/0.35)] transition-transform duration-200",
          size === "md" ? "max-w-lg" : "max-w-sm",
          shown ? "scale-100" : "scale-95",
        )}
      >
        {children}
      </div>
    </div>
  );
}
