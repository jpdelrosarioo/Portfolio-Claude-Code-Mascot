import { posts } from "@/data/site";
import { Reveal } from "./reveal";

/** Plain hairline rows: title + date, with a one-line excerpt underneath. */
export function BlogList() {
  return (
    <ul className="border-t border-g200">
      {posts.map((p) => (
        <Reveal as="li" key={p.title} className="border-b border-g200">
          <a href={p.href} className="group block py-4">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-[15px] font-medium transition-transform duration-300 ease-expo group-hover:translate-x-1">
                {p.title}
              </h3>
              <time className="micro shrink-0 text-g500">{p.date}</time>
            </div>
            <p className="mt-1 truncate text-[13px] text-g500">{p.excerpt}</p>
          </a>
        </Reveal>
      ))}
    </ul>
  );
}
