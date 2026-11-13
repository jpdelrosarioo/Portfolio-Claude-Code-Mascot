import Image from "next/image";
import type { Project } from "@/data/site";
import { cx } from "@/lib/cx";

/** The inside of a project card: optional screenshot, badges, icon + title, description, link buttons.
 *  Shared by the project deck and the "newest build" card so they always look the same. */
export function ProjectCardContent({
  project: p,
  interactive = true,
  wide = false,
}: {
  project: Project;
  interactive?: boolean;
  /** Wide cards (the newest-build card) show a flatter screenshot. */
  wide?: boolean;
}) {
  return (
    <>
      {p.cover && (
        <div
          className={cx(
            "relative mb-4 overflow-hidden rounded-xl border border-g200 bg-g100",
            wide ? "aspect-[21/9]" : "aspect-[16/9]",
          )}
        >
          <Image
            src={p.cover}
            alt={`Screenshot of ${p.title}`}
            fill
            sizes={wide ? "(min-width: 768px) 640px, 100vw" : "(min-width: 640px) 336px, 82vw"}
            className="object-cover object-top"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {p.badges.map((b, bi) => (
          <span
            key={b}
            className={cx(
              "micro inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] max-lg:text-[11px]",
              bi === 0 ? "bg-ink text-bg" : "border border-g300 text-g500",
            )}
          >
            {bi === 0 && <span aria-hidden>‹</span>}
            {b}
            {bi === 0 && <span aria-hidden>›</span>}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {p.image ? (
          <Image
            src={p.image}
            alt=""
            width={88}
            height={88}
            className="size-11 shrink-0 rounded-xl border border-g200 bg-white object-contain p-0.5"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-g200 bg-g100 font-pixel text-[15px] leading-none"
          >
            {p.mark}
          </span>
        )}
        <h3 className="text-[17px] font-medium leading-tight tracking-[-0.01em]">{p.title}</h3>
      </div>

      <p className="mt-3 text-[13px] leading-[1.6] text-g500">{p.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {p.links.map((l, li) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={interactive ? 0 : -1}
            className={cx(
              "group inline-flex items-center gap-1.5 rounded-lg px-3 py-2 max-lg:py-[15px] font-mono text-[11px] font-medium leading-none transition-opacity duration-200",
              li === 0 ? "bg-ink text-bg hover:opacity-85" : "border border-g300 text-ink hover:border-ink",
            )}
          >
            {l.label}
            <span aria-hidden className="inline-block font-sans transition-transform duration-200 ease-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              ↗
            </span>
          </a>
        ))}
      </div>
    </>
  );
}
