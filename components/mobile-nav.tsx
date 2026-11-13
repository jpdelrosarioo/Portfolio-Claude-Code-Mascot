"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ask, navItems, site } from "@/data/site";
import { Icon } from "./icons";
import { SoundToggle } from "./sound-toggle";
import { ThemeCycle, ThemeSwitch } from "./theme-switch";

const textBtn =
  "inline-flex min-h-11 items-center px-1 font-mono text-[11px] font-medium uppercase leading-none tracking-[1px] text-g500 transition-colors duration-200 hover:text-ink";

/** Sticky top bar + full-screen overlay menu, below 1024px. */
export function MobileNav() {
  const [mounted, setMounted] = useState(false); // in the DOM
  const [shown, setShown] = useState(false); // faded in
  const menuRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = () => {
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  };

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(() => setMounted(false), 200);
    openerRef.current?.focus();
  }, []);

  // Close the menu, then open the Ask / typing-test window once the menu has faded out
  const openAndClose = (event: string) => {
    close();
    window.setTimeout(() => window.dispatchEvent(new Event(event)), 220);
  };

  // Scroll lock + focus
  useEffect(() => {
    if (!mounted) return;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted]);

  // Escape closes; Tab stays inside the menu; leaving mobile width closes it
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && menuRef.current) {
        const f = Array.from(menuRef.current.querySelectorAll<HTMLElement>("a, button"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const mq = matchMedia("(min-width: 1024px)");
    const onMq = (e: MediaQueryListEvent) => e.matches && close();
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [mounted, close]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-g200 bg-bg/90 px-4 backdrop-blur-md lg:hidden">
        <a href="#top" className="flex h-11 items-center font-medium">
          {site.name}
        </a>
        <div className="flex items-center gap-4">
          <ThemeCycle />
          <button
            ref={openerRef}
            type="button"
            className={textBtn}
            onClick={open}
            aria-expanded={mounted}
            aria-controls="mobile-menu"
          >
            Menu
          </button>
        </div>
      </header>

      {mounted && (
        <div
          ref={menuRef}
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className={`fixed inset-0 z-[60] flex flex-col bg-bg px-4 pb-6 transition-opacity duration-200 lg:hidden ${
            shown ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-g200">
            <span className="font-medium">{site.name}</span>
            <button ref={closeRef} type="button" className={textBtn} onClick={close}>
              Close
            </button>
          </div>

          <nav aria-label="Mobile">
            <ol className="pt-6">
              {navItems.map((item, i) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={close}
                    style={{ animationDelay: `${50 + i * 50}ms` }}
                    className={`flex items-baseline gap-4 border-b border-g200 py-3.5 text-[1.6rem] font-medium leading-tight tracking-[-0.02em] ${
                      shown ? "animate-[fade-up_700ms_cubic-bezier(0.16,1,0.3,1)_both]" : "opacity-0"
                    }`}
                  >
                    <span className="w-5 shrink-0 font-pixel text-[11px] leading-none tracking-normal text-g400">
                      {String(i).padStart(2, "0")}
                    </span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-auto grid gap-5 pt-6">
            {ask.enabled && (
              <button type="button" onClick={() => openAndClose("open-ask")} className="micro flex items-center gap-2 py-1 text-left text-g500 transition-colors duration-200 hover:text-ink">
                <Icon name="spark" className="size-3.5" /> Ask anything
              </button>
            )}
            <button type="button" onClick={() => openAndClose("open-typing")} className="micro flex items-center gap-2 py-1 text-left text-g500 transition-colors duration-200 hover:text-ink">
              <Icon name="keyboard" className="size-3.5" /> Typing test
            </button>
            <div className="flex items-center gap-2">
              <ThemeSwitch />
              <SoundToggle />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
