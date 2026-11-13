"use client";

import { useState } from "react";
import type { Project } from "@/data/site";
import { cx } from "@/lib/cx";
import { ProjectCardContent } from "./project-card-content";
import { Reveal } from "./reveal";

/** Projects as a fanned deck: the current card sits flat in front, its neighbours tilt behind it. */
export function ProjectDeck({ projects }: { projects: Project[] }) {
  const [index, setIndex] = useState(0);
  const n = projects.length;
  const go = (d: number) => setIndex((i) => (i + d + n) % n);
  // Cards with a screenshot are taller, so the deck needs more room
  const hasCover = projects.some((p) => p.cover);

  return (
    <Reveal>
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label="Projects"
        className={cx(
          "relative mx-auto w-full select-none",
          hasCover ? "h-[31rem] sm:h-[29rem]" : "h-[21rem] sm:h-[19.5rem]",
        )}
      >
        {projects.map((p, i) => {
          let off = i - index;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const abs = Math.abs(off);
          const active = abs === 0;

          return (
            <article
              key={p.title}
              aria-hidden={!active}
              aria-label={`${i + 1} of ${n}`}
              onClick={active ? undefined : () => setIndex(i)}
              style={{
                transform: `translateX(calc(-50% + ${off * 64}%)) rotate(${off * 7}deg) scale(${active ? 1 : 0.94})`,
                opacity: active ? 1 : abs === 1 ? 0.55 : 0,
                zIndex: 10 - abs,
              }}
              className={cx(
                "absolute left-1/2 top-3 w-[min(21rem,82%)] rounded-2xl border border-g200 bg-linear-to-b from-g50 to-bg p-5",
                "transition-[transform,opacity,box-shadow] duration-500 ease-expo",
                active ? "shadow-card-hover" : "cursor-pointer shadow-card [&_a]:pointer-events-none",
                abs > 1 && "pointer-events-none",
              )}
            >
              <ProjectCardContent project={p} interactive={active} />
            </article>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-2 flex items-center justify-center gap-5">
          <button type="button" onClick={() => go(-1)} aria-label="Previous project" className="micro py-2 text-g500 transition-colors duration-200 hover:text-ink max-lg:px-1 max-lg:py-3.5">
            ← Prev
          </button>
          <div className="flex items-center gap-1.5" role="group" aria-label="Choose a project">
            {projects.map((p, i) => (
              <button
                key={p.title}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${p.title}`}
                aria-current={i === index}
                className="grid size-4 place-items-center max-lg:size-11"
              >
                <span className={cx("block rounded-full bg-ink transition-all duration-300", i === index ? "size-1.5" : "size-1 opacity-25")} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="Next project" className="micro py-2 text-g500 transition-colors duration-200 hover:text-ink max-lg:px-1 max-lg:py-3.5">
            Next →
          </button>
        </div>
      )}
    </Reveal>
  );
}
