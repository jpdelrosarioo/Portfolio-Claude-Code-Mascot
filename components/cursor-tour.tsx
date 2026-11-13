"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { tour, type TourStop } from "@/data/site";
import { markTourSeen, tourSeen } from "@/lib/tour-state";
import { confetti } from "./confetti";
import { Icon } from "./icons";

/**
 * A guided tour: an animated cursor glides over the page, the page scrolls to each part, the part is lit up and a small
 * card explains it. It plays by itself (pause it, or step with Back / Next or the arrow keys) and Esc ends it.
 * Start it with Alt+T, the sidebar, the menu, or by firing the "start-tour" event. It also starts by itself the first
 * time someone opens the site, and finishing it (reaching the end) ends with confetti.
 */

type Box = { left: number; top: number; width: number; height: number };

const GLIDE = 950; // how long the cursor takes to travel from one stop to the next (ms)
const PAD = 10; // space around the lit-up part

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** On the page and really visible (a hidden sidebar, for example, is not). */
const usable = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
};

/** Inside something that stays put while the page scrolls (the sidebar). */
const staysPut = (el: HTMLElement) => {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true;
  return false;
};

/** The sticky bar on phones and tablets covers the top of the page. */
const topBar = () => (innerWidth < 1024 ? 56 : 0);

/** Too tall to have room for the card above or below it on this screen. */
const isTall = (r: DOMRect) => r.height > innerHeight - topBar() - 250;

/** What is lit up: exactly the part, the same size as its container. (On a small screen a part can be taller than the
 *  screen; its light then simply carries on past the edge of the screen, so it never ends in the wrong place.) */
const litBox = (r: DOMRect): Box => ({ left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });

/** Where the tip of the cursor points. */
const aim = (r: DOMRect) => ({
  x: r.width < 260 ? r.left + r.width * 0.55 : r.left + Math.min(r.width * 0.35, 240),
  y: r.height < 80 || !isTall(r) ? r.top + Math.min(r.height * 0.5, 44) : r.top + 36,
});

const nap = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));

/** Resolves when the page has stopped scrolling. */
const scrolled = (stillGoing: () => boolean) =>
  new Promise<void>((done) => {
    const t0 = performance.now();
    let last = -1;
    let still = 0;
    const tick = () => {
      if (!stillGoing()) return done();
      still = Math.abs(scrollY - last) < 0.5 ? still + 1 : 0;
      last = scrollY;
      if (still >= 6 || performance.now() - t0 > 2500) return done();
      window.setTimeout(tick, 30);
    };
    tick();
  });

export function CursorTour() {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<TourStop[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"moving" | "here">("moving");
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState<Box | null>(null);
  const [follow, setFollow] = useState(true); // true: the cursor and the light stick to the part while the visitor scrolls
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState(false);
  const [cardH, setCardH] = useState(0);

  const run = useRef(0); // changes with every move, so one that was overtaken stops
  const stepsRef = useRef<TourStop[]>([]);
  const phaseRef = useRef<"moving" | "here">("moving");
  const elRef = useRef<HTMLElement | null>(null);
  const touched = useRef<HTMLElement | null>(null); // the portrait while the cursor is "on" it
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const before = useRef<HTMLElement | null>(null); // what had the focus before the tour
  const openRef = useRef(false);
  phaseRef.current = phase;

  const letGo = () => {
    touched.current?.dispatchEvent(new PointerEvent("pointerleave"));
    touched.current = null;
  };

  /** The tour ends: skipped (Esc, ×) or finished (the last stop done, which gets confetti). */
  const end = useCallback((finished: boolean) => {
    run.current++;
    openRef.current = false;
    letGo();
    setOpen(false);
    setBox(null);
    before.current?.focus?.({ preventScroll: true });
    window.dispatchEvent(new Event("tour-end"));
    if (finished) window.setTimeout(() => confetti(), 150);
  }, []);
  const close = useCallback(() => end(false), [end]);
  const finish = useCallback(() => end(true), [end]);

  /** Go to stop `i` (or, if it is not on this screen, the next one in direction `dir`). */
  const visit = useCallback(
    async (i: number, dir: 1 | -1 = 1) => {
      const list = stepsRef.current;
      const my = ++run.current;
      const alive = () => my === run.current;
      letGo();

      let k = i;
      let el: HTMLElement | null = null;
      for (; k >= 0 && k < list.length; k += dir) {
        const found = document.querySelector(list[k].target);
        if (usable(found)) {
          el = found;
          break;
        }
      }
      if (!el) return k >= list.length ? finish() : close(); // nothing left to show
      elRef.current = el;
      setIndex(k);
      setPhase("moving");
      setFollow(false);

      // bring it into view (the page scrolls, the cursor waits where it is)
      if (!staysPut(el)) {
        const r = el.getBoundingClientRect();
        const header = topBar();
        // a part with room for the card below it sits a little above the middle; a big one starts at the top
        const want = isTall(r)
          ? header + 16
          : Math.max(header + 16, header + (innerHeight - header) * (innerWidth < 640 ? 0.3 : 0.38) - r.height / 2);
        const y = Math.min(document.documentElement.scrollHeight - innerHeight, Math.max(0, scrollY + r.top - want));
        if (Math.abs(y - scrollY) > 4) {
          scrollTo({ top: y, behavior: reduced() ? "auto" : "smooth" });
          await scrolled(alive);
        }
      }
      if (!alive()) return;

      // glide the cursor over, with the light moving along
      let r = el.getBoundingClientRect();
      setBox(litBox(r));
      setCursor(aim(r));
      await nap(reduced() ? 0 : GLIDE + 60);
      if (!alive()) return;

      // the page may have settled a few pixels while the cursor travelled (the entrance animation)
      r = el.getBoundingClientRect();
      setBox(litBox(r));
      setCursor(aim(r));
      setPhase("here");

      if (list[k].action === "dust") {
        // the cursor touches the portrait: it turns to dust, then comes back together
        const p = aim(r);
        touched.current = el;
        el.dispatchEvent(new PointerEvent("pointerenter", { clientX: p.x, clientY: p.y, pointerType: "mouse" }));
        await nap(2600);
        if (alive()) letGo();
      }
    },
    [close, finish],
  );

  const start = useCallback(() => {
    const list = tour.stops.filter((s) => usable(document.querySelector(s.target)));
    stepsRef.current = list;
    if (!list.length) return;
    markTourSeen(); // however it started, this visitor has seen the tour
    openRef.current = true;
    before.current = document.activeElement as HTMLElement | null;
    setSteps(list);
    setPlaying(!reduced());
    setBox(null);
    setPhase("moving");
    setFollow(true);
    setCursor({ x: innerWidth * 0.5, y: innerHeight * 0.88 }); // it enters from the bottom of the screen
    setOpen(true);
    window.setTimeout(() => void visit(0), 80);
  }, [visit]);

  // starting: Alt+T, or the "start-tour" event from the sidebar / menu
  useEffect(() => {
    if (!tour.enabled) return;
    let timer = 0;
    const begin = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(start, 280); // lets a menu that was just clicked close first
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (open) close();
        else begin();
      }
    };
    window.addEventListener("start-tour", begin);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("start-tour", begin);
      document.removeEventListener("keydown", onKey);
    };
  }, [start, close, open]);

  const go = useCallback(
    (to: number) => {
      if (to < 0) return;
      if (to >= stepsRef.current.length) return finish();
      void visit(to, to < index ? -1 : 1);
    },
    [visit, finish, index],
  );

  // The first time someone opens the site, the tour starts by itself (once the page has settled, and only if they haven't
  // already begun scrolling around or opened something).
  useEffect(() => {
    if (!tour.enabled || !tour.autoStart || tourSeen()) return;
    const id = window.setTimeout(() => {
      if (openRef.current || scrollY > 200 || document.querySelector('[aria-modal="true"]')) return;
      start();
    }, tour.autoStartDelay);
    return () => window.clearTimeout(id);
  }, [start]);

  // arrow keys step through, Esc ends
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.matches?.("input, textarea, [contenteditable]");
      if (e.key === "Escape") close();
      else if (!typing && e.key === "ArrowRight") go(index + 1);
      else if (!typing && e.key === "ArrowLeft") go(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, go, close, index]);

  // while the visitor scrolls or resizes, the cursor and the light stay on the part
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const relayout = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = elRef.current;
        if (phaseRef.current !== "here" || !usable(el)) return;
        const r = el.getBoundingClientRect();
        setFollow(true);
        setBox(litBox(r));
        setCursor(aim(r));
      });
    };
    window.addEventListener("scroll", relayout, { passive: true });
    window.addEventListener("resize", relayout);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", relayout);
      window.removeEventListener("resize", relayout);
    };
  }, [open]);

  // the card's height decides where it can sit; the Next button takes the focus (keyboard users keep going with Enter)
  useLayoutEffect(() => {
    if (open && phase === "here") setCardH(cardRef.current?.offsetHeight ?? 0);
  }, [open, phase, index]);
  useEffect(() => {
    if (open && phase === "here") nextRef.current?.focus({ preventScroll: true });
  }, [open, phase, index]);

  useEffect(
    () => () => {
      run.current++;
      letGo();
    },
    [],
  );

  if (!open) return null;

  const stop = steps[index];
  const last = index >= steps.length - 1;
  const phone = typeof window !== "undefined" && innerWidth < 640;
  const readMs = Math.min(7500, Math.max(3800, 2600 + stop.text.length * 30)); // time to read it before it moves on

  // the card sits beside the lit-up part, never over it: below, else above, else to the side
  const cardWidth = Math.min(330, innerWidth - 24);
  const cardStyle = (() => {
    if (phone || !box) return undefined;
    const m = 12;
    const gap = 16;
    const x = (v: number) => Math.min(Math.max(m, v), innerWidth - cardWidth - m);
    const y = (v: number) => Math.min(Math.max(m, v), innerHeight - cardH - m);
    if (box.top + box.height + gap + cardH <= innerHeight - m) return { left: x(cursor.x - 40), top: box.top + box.height + gap };
    if (box.top - gap - cardH >= m) return { left: x(cursor.x - 40), top: box.top - gap - cardH };
    if (box.left + box.width + gap + cardWidth <= innerWidth - m) return { left: box.left + box.width + gap, top: y(box.top) };
    if (box.left - gap - cardWidth >= m) return { left: box.left - gap - cardWidth, top: y(box.top) };
    return { left: innerWidth - cardWidth - m, top: innerHeight - cardH - m };
  })();

  const small =
    "micro rounded-full px-3 py-1.5 text-g500 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-g500 max-lg:py-2.5";

  return (
    <>
      {/* the light on the part being shown: the rest of the page dims */}
      {box && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[89] rounded-2xl"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 1.5px rgb(var(--ink) / 0.85), 0 0 0 100vmax rgb(0 0 0 / 0.5)",
            transition: follow ? "none" : `left ${GLIDE}ms cubic-bezier(.5,0,.15,1), top ${GLIDE}ms cubic-bezier(.5,0,.15,1), width ${GLIDE}ms ease, height ${GLIDE}ms ease`,
          }}
        />
      )}

      {/* the cursor: sideways and up/down move on slightly different curves, so it travels in an arc like a hand */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[90]"
        style={{ transform: `translateX(${cursor.x}px)`, transition: follow ? "none" : `transform ${GLIDE}ms cubic-bezier(.5,0,.15,1)` }}
      >
        <div style={{ transform: `translateY(${cursor.y}px)`, transition: follow ? "none" : `transform ${GLIDE}ms cubic-bezier(.2,.7,.25,1)` }}>
          <div className="tour-cursor-in relative">
            {phase === "here" && (
              <span key={index} className="tour-ripple absolute -left-3 -top-3 size-6 rounded-full border-2 border-ink" />
            )}
            <svg viewBox="0 0 24 24" className="relative size-6 drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]" fill="rgb(var(--ink))" stroke="rgb(var(--bg))" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
            </svg>
            <span className="micro absolute left-4 top-5 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 font-medium text-bg shadow-md">
              {tour.cursorLabel}
            </span>
          </div>
        </div>
      </div>

      {phase === "here" && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label="Portfolio tour"
          aria-live="polite"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className="tour-card-in fixed z-[91] rounded-2xl border border-g200 bg-bg text-left font-sans text-[13px] shadow-[0_24px_50px_-18px_rgb(0_0_0/0.55)] max-sm:inset-x-3 max-sm:bottom-[max(12px,env(safe-area-inset-bottom))]"
          style={phone ? undefined : { ...cardStyle, width: cardWidth }}
        >
          {/* time left before it moves on by itself */}
          <div className="h-0.5 overflow-hidden rounded-t-2xl bg-g100">
            {playing && (
              <div
                key={index}
                className="tour-bar h-full bg-ink"
                style={{ ["--tour-ms" as string]: `${readMs}ms`, animationPlayState: hover ? "paused" : "running" }}
                onAnimationEnd={() => go(index + 1)}
              />
            )}
          </div>
          <div className="px-4 pb-3 pt-3">
            <div className="micro flex items-center justify-between text-g500">
              <span>
                Tour · {index + 1}/{steps.length}
              </span>
              <button type="button" onClick={close} aria-label="End the tour" className="-mr-2 -mt-1 grid size-7 place-items-center rounded-md text-base leading-none hover:text-ink max-lg:size-9">
                ×
              </button>
            </div>
            <h2 className="mt-1.5 text-[14px] font-semibold leading-snug">{stop.title}</h2>
            <p className="mt-1 text-[13px] leading-[1.55] text-g600">{stop.text}</p>
          </div>
          <div className="flex items-center justify-between border-t border-g200 px-2 py-1.5">
            <button type="button" className={small} disabled={index === 0} onClick={() => go(index - 1)}>
              ← Back
            </button>
            <button type="button" className={small} onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
              {playing ? "Pause" : "Auto-play"}
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={() => go(index + 1)}
              className="micro flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 font-medium text-bg transition-opacity hover:opacity-80 max-lg:py-2.5"
            >
              {last ? "Finish" : "Next"} <Icon name="arrow" className="size-3" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
