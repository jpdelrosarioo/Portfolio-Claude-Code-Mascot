import Image from "next/image";
import { Organizations, certifications, recommendations } from "@/data/site";
import { Reveal } from "./reveal";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Three cards, each with an inset hairline frame and a logo slot. */
export function Certifications() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {certifications.map((c) => (
        <Reveal
          as="li"
          key={c.title}
          className="rounded-2xl border border-g200 bg-linear-to-b from-g50 to-bg p-[5px] shadow-card transition-[translate,box-shadow] duration-[420ms] ease-expo hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <a
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group grid h-full justify-items-center gap-1 rounded-xl border border-g200 px-3 py-5 text-center"
          >
            {c.mark.startsWith("/") ? (
              // a path such as "/microsoft.svg" (a file in /public) shows that image
              <Image
                src={c.mark}
                alt=""
                width={80}
                height={80}
                unoptimized={c.mark.endsWith(".svg")} // Next doesn't resize SVGs; they scale on their own
                className="mb-2 size-10 rounded-lg border border-g200 bg-white object-contain p-1"
              />
            ) : (
              // anything else, like "A", is shown as a letter
              <span aria-hidden className="mb-2 grid size-10 place-items-center rounded-lg border border-g200 bg-bg font-pixel text-sm leading-none">
                {c.mark}
              </span>
            )}
            <span className="text-[13px] font-semibold leading-snug">{c.title}</span>
            <span className="micro text-g500">{c.issuer}</span>
            <span className="micro mt-2 inline-flex items-center gap-1.5 text-g400 transition-colors duration-200 group-hover:text-ink">
              <span aria-hidden>‹</span> Verify <span aria-hidden>›</span>
            </span>
          </a>
        </Reveal>
      ))}
    </ul>
  );
}

/** Quote cards: serif text, hairline, then who said it. */
export function Recommendations() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {recommendations.map((r) => (
        <Reveal as="li" key={r.name} className="flex flex-col rounded-2xl border border-g200 bg-g50 p-5">
          <span aria-hidden className="mb-2 font-pixel text-2xl leading-none text-g400">
            “
          </span>
          <blockquote className="line-clamp-5 flex-1 font-serif text-[15px] leading-[1.6]">{r.quote}</blockquote>
          <div className="mt-5 flex items-center gap-3 border-t border-g200 pt-4">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-g100 font-mono text-[10px] font-medium">
              {initials(r.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{r.name}</span>
              <span className="micro mt-0.5 block truncate text-g500">{r.role}</span>
            </span>
          </div>
        </Reveal>
      ))}
    </ul>
  );
}

/** A simple row of logo-slot + name + role. */
export function OrganizationsList() {
  return (
    <Reveal as="ul" className="flex flex-wrap gap-x-8 gap-y-5">
      {Organizations.map((a) => (
        <li key={a.name} className="flex items-center gap-3">
          {a.mark.startsWith("/") ? (
            // a path such as "/projects/JPSSITE.jpg" (a file in /public) shows that image
            <Image
              src={a.mark}
              alt=""
              width={72}
              height={72}
              unoptimized={a.mark.endsWith(".svg")} // Next doesn't resize SVGs; they scale on their own
              className="size-9 shrink-0 rounded-lg border border-g200 bg-white object-contain p-0.5"
            />
          ) : (
            // anything else, like "S", is shown as a letter
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg border border-g200 bg-g50 font-pixel text-sm leading-none">
              {a.mark}
            </span>
          )}
          <span>
            <span className="block text-[13px] font-semibold leading-tight">{a.name}</span>
            <span className="micro mt-0.5 block text-g500">{a.role}</span>
          </span>
        </li>
      ))}
    </Reveal>
  );
}
