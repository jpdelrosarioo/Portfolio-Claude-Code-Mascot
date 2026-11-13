"use client";

import { useEffect, useRef, useState } from "react";

/** Button that copies an email address to the clipboard, with a polite screen-reader announcement. */
export function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const finish = (ok: boolean) => {
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  };

  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = email;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    document.body.removeChild(ta);
    finish(ok);
  };

  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(email).then(() => finish(true), fallback);
    } else {
      fallback();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="group inline-flex items-center gap-1.5 py-2.5 max-lg:py-4 font-mono text-[11px] font-medium uppercase leading-none tracking-[1px] text-g500 transition-colors duration-200 hover:text-ink"
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : "Copy email"}
        <span aria-hidden className="inline-block font-sans transition-transform duration-200 ease-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
          ↗
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Email address copied to clipboard" : ""}
      </span>
    </>
  );
}
