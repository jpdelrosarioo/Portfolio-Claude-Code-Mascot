import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/** A numbered page section: "01 — blog" on the left, an optional "ALL POSTS →" link on the right. */
export function Section({
  id,
  label,
  title,
  cta,
  children,
}: {
  id: string;
  label: string;
  /** Optional large heading under the label (used by the contact section). */
  title?: string;
  cta?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-title` : `${id}-label`} className="mt-24 scroll-mt-14 lg:scroll-mt-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        {title ? (
          <Reveal as="p" className="font-pixel text-[13px] leading-none text-g500">
            {label}
          </Reveal>
        ) : (
          <Reveal as="h2" id={`${id}-label`} className="font-pixel text-[13px] leading-none text-g500">
            {label}
          </Reveal>
        )}
        {cta && (
          <Reveal
            as="a"
            href={cta.href}
            className="group micro inline-flex items-center gap-1.5 text-g500 transition-colors duration-200 hover:text-ink max-lg:-my-3.5 max-lg:py-3.5"
          >
            {cta.label}
            <span aria-hidden className="transition-transform duration-200 ease-expo group-hover:translate-x-0.5">
              →
            </span>
          </Reveal>
        )}
      </div>
      {title && (
        <Reveal as="h2" id={`${id}-title`} className="mb-3 text-[1.6rem] font-semibold leading-tight tracking-[-0.02em]">
          {title}
        </Reveal>
      )}
      {children}
    </section>
  );
}
