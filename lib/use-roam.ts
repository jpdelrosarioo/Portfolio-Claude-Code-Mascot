"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mood, Posture } from "./mood";
import type { Command } from "./nlp";
import { Roamer, SPRITE, type Ctx, type Engaged, type Platform, type Pose, type Scene } from "./roam";

/**
 * Makes the mascot move around the intro (see lib/roam.ts for what it does). `target` is the intro (the header the mascot
 * lives in), `surname` the word it perches on. It measures where the portrait and the perch are, moves the element behind
 * `ref` every frame (without re-rendering), and reports what it is doing (`pose`) and which way it looks (`face`) when
 * those change. It only runs while the intro is on screen and the tab is visible, and with reduced motion it stays put.
 */
export function useRoam({ target, surname, mood, posture, engaged, still = false }: { target: HTMLElement | null; surname: HTMLElement | null; mood: Mood | null; posture: Posture; engaged: Engaged; still?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ pose: Pose; face: 1 | -1 }>({ pose: "stand", face: 1 });
  const [ready, setReady] = useState(false);
  const roamer = useRef<Roamer | null>(null);
  const live = useRef<Ctx>({ mood: "happy", posture: "stand", engaged: "none", reduced: false });

  useEffect(() => {
    live.current.mood = mood ?? "happy";
    live.current.posture = posture;
    live.current.engaged = engaged;
  }, [mood, posture, engaged]);

  const known = mood !== null;
  useEffect(() => {
    if (!target || !surname || !known) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setReduced = () => (live.current.reduced = mq.matches || still); // (reduced motion, or switched off in the settings: it stays on its perch)
    setReduced();
    mq.addEventListener("change", setReduced);

    /**
     * The three top edges it can sit or stand on, and its perch: the top of the portrait, the top of the name, the top of the
     * intro text. (Nowhere else: not over the picture, not down its sides.) In px from the top-left of the intro.
     */
    const measure = (): Scene => {
      const hr = target.getBoundingClientRect();
      const sr = surname.getBoundingClientRect();
      const h1 = surname.closest("h1");
      const em = parseFloat(getComputedStyle(surname).fontSize) || 40;
      const nameY = sr.top - hr.top + 0.5; // sitting, its body rests on the top of the name’s box
      // the perch: where it has always sat, at the end of the surname
      const home = { x: sr.right - hr.left - 0.55 * em - 22, y: nameY };
      const platforms: Platform[] = [];

      // 1. the top of the portrait
      const el = target.querySelector<HTMLElement>('canvas[role="img"]') ?? target.querySelector<HTMLElement>('img[alt^="Portrait"]');
      if (el) {
        const pr = el.getBoundingClientRect();
        if (pr.width > 60) platforms.push({ id: "portrait", left: pr.left - hr.left, right: pr.right - hr.left, y: pr.top - hr.top, drop: 0 });
      }

      // 2. the top of the name (standing, its feet reach down to the tops of the letters: about a quarter of the letter size)
      let nameLeft = sr.left - hr.left;
      if (h1) {
        const range = document.createRange();
        range.selectNodeContents(h1);
        const first = range.getClientRects()[0];
        if (first) nameLeft = first.left - hr.left;
      }
      const nameRight = sr.right - hr.left - 0.55 * em; // (so that the centre can reach the perch)
      platforms.push({ id: "name", left: Math.min(nameLeft, nameRight - 60), right: nameRight, y: nameY, drop: 0.23 * em });

      // 3. the top of the intro text (the first line’s letters are a little below the top of its box)
      const p = h1 ? Array.from(target.querySelectorAll("p")).find((x) => h1.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) : undefined;
      if (p) {
        const pr = p.getBoundingClientRect();
        const cs = getComputedStyle(p);
        const fs = parseFloat(cs.fontSize) || 15;
        const lh = parseFloat(cs.lineHeight) || fs * 1.6;
        if (pr.width > 60) platforms.push({ id: "intro", left: pr.left - hr.left, right: pr.right - hr.left, y: pr.top - hr.top + 0.5, drop: (lh - fs) / 2 + 0.2 * fs });
      }

      // never half off the screen
      const lo = SPRITE.w / 2 + 2 - hr.left;
      const hi = window.innerWidth - SPRITE.w / 2 - 2 - hr.left;
      for (const q of platforms) {
        q.left = Math.max(q.left, lo - 22);
        q.right = Math.min(q.right, hi + 22);
      }
      return { home, platforms };
    };

    let scene = measure();
    const r = new Roamer(Math.random, scene, performance.now(), live.current);
    roamer.current = r;
    let lastPose = r.pose;
    let lastFace = r.face;

    const draw = () => {
      const el = ref.current;
      if (!el) return;
      const sits = r.pose === "sit" || r.pose === "sleep";
      const anchor = sits ? SPRITE.sitAnchor : SPRITE.standAnchor;
      const lower = sits ? 0 : r.drop; // standing, its feet reach down to the letters
      el.style.transform = `translate3d(${(r.pos.x - SPRITE.w / 2).toFixed(1)}px, ${(r.pos.y + lower - anchor - r.lift).toFixed(1)}px, 0)`;
      if (r.pose !== lastPose || r.face !== lastFace) {
        lastPose = r.pose;
        lastFace = r.face;
        setView({ pose: r.pose, face: r.face });
      }
    };

    let raf = 0;
    let last = performance.now();
    let lastScene = last;
    let running = false;
    let inView = true;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (t - lastScene > 1000) {
        scene = measure();
        r.setScene(scene); // (the page settles after it loads, and the window can be resized)
        lastScene = t;
      }
      r.step(dt, t, live.current);
      draw();
    };
    const update = () => {
      const should = inView && !document.hidden;
      if (should && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
        update();
      },
      { rootMargin: "200px" },
    );
    io.observe(target);
    const onResize = () => {
      scene = measure();
      r.setScene(scene);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", update);
    const ro = new ResizeObserver(onResize);
    ro.observe(target);

    draw();
    setView({ pose: r.pose, face: r.face });
    setReady(true);
    update();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", update);
      mq.removeEventListener("change", setReduced);
      roamer.current = null;
    };
  }, [target, surname, known, still]);

  /** Tell it to do something ("sit down", "go for a walk"). */
  const command = useCallback((c: Command) => roamer.current?.command(c, performance.now(), live.current), []);

  return { ref, pose: view.pose, face: view.face, ready, command };
}
