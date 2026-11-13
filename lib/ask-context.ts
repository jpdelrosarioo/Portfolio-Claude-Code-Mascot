import {
  Organizations,
  certifications,
  experience,
  latestBuild,
  projects,
  recommendations,
  site,
  stack,
  type Project,
  type Segment,
} from "@/data/site";

/** Turns the intro (text + chips + logos) into one plain sentence. */
function introText(segments: readonly Segment[]) {
  return segments
    .map((s) => {
      if ("t" in s) return s.t;
      if ("chip" in s) return s.chip;
      if ("br" in s) return " ";
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

const project = (p: Project) =>
  `- ${p.title} (${p.badges.join(", ")}): ${p.description}${
    p.links.length ? ` Links: ${p.links.map((l) => `${l.label} ${l.href}`).join(", ")}.` : ""
  }`;

/** Everything the AI is allowed to know about you — built from data/site.ts. */
export function buildKnowledge() {
  return [
    `Name: ${site.name}`,
    `Headline: ${site.title}`,
    `About: ${introText(site.intro)}`,
    `Availability: ${site.available ? "Open to work / available for new projects" : "Not currently taking new projects"}`,
    `Email: ${site.email}`,
    `Links: ${site.socials.map((s) => `${s.label} ${s.href}`).join(", ")}`,
    "",
    "Newest build:",
    project(latestBuild),
    "",
    "Projects:",
    ...projects.map(project),
    "",
    "Experience:",
    ...experience.map((e) => `- ${e.year}: ${e.role} at ${e.company}`),
    "",
    "Tech stack:",
    ...stack.filter((g) => g.items.length > 0).map((g) => `- ${g.group}: ${g.items.join(", ")}`),
    "",
    "Certifications:",
    ...certifications.map((c) => `- ${c.title} (${c.issuer})`),
    "",
    "Organizations:",
    ...Organizations.map((a) => `- ${a.name} (${a.role})`),
    "",
    "What other people say:",
    ...recommendations.map((r) => `- ${r.name}, ${r.role}: "${r.quote}"`),
  ].join("\n");
}
