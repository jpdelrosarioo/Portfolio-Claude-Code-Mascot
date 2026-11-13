import { latestBuild } from "@/data/site";
import { ProjectCardContent } from "./project-card-content";
import { Reveal } from "./reveal";

/** One wide card for the newest app — same design as the cards in "02 — projects". */
export function LatestBuild() {
  return (
    <Reveal as="section" aria-label="Newest build" className="mt-14">
      <p className="micro mb-3 text-g500">Newest build</p>
      <div className="rounded-2xl border border-g200 bg-linear-to-b from-g50 to-bg p-5 shadow-card sm:p-6">
        <ProjectCardContent project={latestBuild} wide />
      </div>
    </Reveal>
  );
}
