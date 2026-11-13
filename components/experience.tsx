import { experience, stack } from "@/data/site";
import { Reveal } from "./reveal";
import { StackIcon } from "./stack-icon";

/** Hairline-ruled career rows, then the stack as mono chips. */
export function Experience() {
  return (
    <>
      <ol className="border-t border-g200">
        {experience.map((x, i) => (
          <Reveal
            as="li"
            key={`${x.year}-${i}`}
            className="grid grid-cols-[3rem_1fr] items-baseline gap-x-4 gap-y-0.5 border-b border-g200 py-3 sm:grid-cols-[4rem_1fr_auto]"
          >
            <span className="micro text-g500">{x.year}</span>
            <span className="text-[14px] font-medium">{x.role}</span>
            <span className="col-start-2 text-[13px] text-g500 sm:col-start-auto sm:text-right">{x.company}</span>
          </Reveal>
        ))}
      </ol>

      <div id="stack" className="mt-12 scroll-mt-14 lg:scroll-mt-10">
        <Reveal as="h3" className="micro mb-4 text-g500">
          Stack
        </Reveal>
        {/* One rounded container; each category is a row inside it, and every technology has its logo. */}
        <Reveal className="overflow-hidden rounded-2xl border border-g200 bg-linear-to-b from-g50 to-bg shadow-card">
          {stack
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.group} className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-[7rem_1fr] sm:p-5">
                <h4 className="micro pt-1.5 text-g500">{g.group}</h4>
                <ul className="flex flex-wrap gap-2" aria-label={`${g.group} technologies`}>
                  {g.items.map((s) => (
                    <li
                      key={s}
                      className="inline-flex items-center gap-2 rounded-lg border border-g200 bg-bg px-3 py-1.5 font-mono text-xs transition-[translate,border-color] duration-200 hover:-translate-y-0.5 hover:border-g400"
                    >
                      <StackIcon label={s} className="size-4" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </Reveal>
      </div>
    </>
  );
}
