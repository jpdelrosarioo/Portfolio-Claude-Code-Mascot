"use client";

import { useEffect } from "react";

/**
 * In-page links (the sidebar, the mobile menu, "Back to top", the section links) are written as `href="#projects"`, which
 * makes the browser add `#projects` to the address. This scrolls to the section smoothly instead and keeps the address
 * clean. Without JavaScript the links still work the normal way. Ctrl/Cmd-click, middle-click and "open in new tab" are
 * left alone.
 */
export function CleanAnchors() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;
      const id = decodeURIComponent(link.getAttribute("href")!.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      if (!target && id !== "top") return; // not one of ours: let the browser handle it

      e.preventDefault();
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      if (id === "top") window.scrollTo({ top: 0, behavior });
      else target!.scrollIntoView({ behavior });
      // forget any #section already in the address
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
