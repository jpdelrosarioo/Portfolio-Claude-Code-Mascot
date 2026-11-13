"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Email me" that works even when the visitor has no email app set up.
 *
 * It first tries the normal mailto: link. If an email app opens, the browser window loses focus and nothing else
 * happens. If nothing opens (very common on Windows, and for people who use Gmail or Outlook in the browser), a small menu
 * appears with webmail and copy options.
 */
export function EmailButton({ email, className, children }: { email: string; className?: string; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  // close the menu on a click outside it or on Escape
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = () => {
    // let the mailto: link try; if the page keeps focus, no email app took over, so offer the alternatives
    let handled = false;
    const onBlur = () => (handled = true);
    window.addEventListener("blur", onBlur, { once: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      window.removeEventListener("blur", onBlur);
      if (!handled && document.hasFocus()) setMenu(true);
    }, 900);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = email;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const to = encodeURIComponent(email);
  const item =
    "flex w-full items-center rounded-lg px-3 py-2.5 text-left font-mono text-[12px] text-ink transition-colors duration-200 hover:bg-g100";

  return (
    <div ref={wrap} className="relative inline-block">
      <a href={`mailto:${email}`} onClick={onClick} className={className} aria-haspopup="menu" aria-expanded={menu}>
        {children}
      </a>
      {menu && (
        <div
          role="menu"
          aria-label="Other ways to email"
          className="absolute left-0 top-full z-20 mt-2 w-60 rounded-xl border border-g200 bg-bg p-1.5 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]"
        >
          <p className="micro px-3 pb-1.5 pt-2 text-g500">No email app opened? Use:</p>
          <a
            role="menuitem"
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${to}`}
            target="_blank"
            rel="noopener noreferrer"
            className={item}
            onClick={() => setMenu(false)}
          >
            Open in Gmail ↗
          </a>
          <a
            role="menuitem"
            href={`https://outlook.live.com/mail/0/deeplink/compose?to=${to}`}
            target="_blank"
            rel="noopener noreferrer"
            className={item}
            onClick={() => setMenu(false)}
          >
            Open in Outlook ↗
          </a>
          <button type="button" role="menuitem" className={item} onClick={copy}>
            {copied ? "Copied ✓" : "Copy email address"}
          </button>
        </div>
      )}
    </div>
  );
}
