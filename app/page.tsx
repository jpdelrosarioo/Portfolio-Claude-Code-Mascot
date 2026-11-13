import { AiLogos } from "@/components/ai-logos";
import { Affiliations, Certifications, Recommendations } from "@/components/credentials";
import { CopyEmail } from "@/components/copy-email";
import { EmailButton } from "@/components/email-button";
import { NameMascot } from "@/components/name-mascot";
import { BlogList } from "@/components/blog-list";
import { Experience } from "@/components/experience";
import { GithubGrid } from "@/components/github-grid";
import { Icon } from "@/components/icons";
import { LatestBuild } from "@/components/latest-build";
import { Portrait } from "@/components/portrait";
import { ProjectDeck } from "@/components/project-deck";
import { Reveal } from "@/components/reveal";
import { Section } from "@/components/section";
import { SocialIcon, socialNameFor } from "@/components/social-icon";
import { Status } from "@/components/status";
import { portraitFocus, portraitFps, portraitFrames } from "@/lib/portrait-frames";
import { ctas, projects, site } from "@/data/site";

const btnPrimary =
  "inline-flex items-center rounded-lg bg-ink px-4 py-3 max-lg:py-4 font-mono text-[11px] font-medium uppercase leading-none tracking-[1px] text-bg transition-opacity duration-200 hover:opacity-85";

export default function Home() {
  const year = new Date().getFullYear();
  const githubHref = site.githubUser ? `https://github.com/${site.githubUser}` : "https://github.com/";

  return (
    <div className="mx-auto max-w-[44rem] px-4 pt-12 lg:max-w-[45rem] lg:px-6 lg:pt-24">
      {/* ───────── Hero ───────── */}
      <header id="top" className="relative isolate scroll-mt-14">
        {/* Halftone accent — dissolves into the corner */}
        <div
          aria-hidden
          className="halftone mask-corner absolute -right-4 -top-12 -z-10 h-72 w-[min(24rem,80vw)] opacity-60 lg:-right-6 lg:-top-24"
        />

        <div className="grid items-start gap-8 sm:grid-cols-[18rem_1fr] sm:gap-9">
          <Reveal className="mx-auto w-full max-w-[18rem] sm:mx-0">
            <Portrait src={site.portrait || undefined} srcDark={site.portraitDark || undefined} frames={portraitFrames()} fps={portraitFps()} alt={`Portrait of ${site.name}`} style={site.portraitStyle} focus={portraitFocus()} />
          </Reveal>

          <div>
            {/* relative z-30: the mascot's speech bubble opens over the intro text below */}
            <Reveal className="relative z-30">
              <NameMascot name={site.name} className="font-pixel text-[clamp(2.1rem,8vw,2.6rem)] leading-none" />
            </Reveal>

            <Reveal as="p" className="mt-6 text-[15px] leading-[2.15]">
              {site.intro.map((seg, i) =>
                "chip" in seg ? (
                  <span
                    key={i}
                    className="mx-0.5 inline-flex items-center gap-1.5 rounded-full bg-g100 px-2.5 py-0.5 align-baseline text-[14px] font-medium leading-snug"
                  >
                    {seg.icon && <Icon name={seg.icon} />}
                    {seg.chip}
                  </span>
                ) : "logos" in seg ? (
                  <AiLogos key={i} logos={seg.logos} label={seg.label} />
                ) : "br" in seg ? (
                  <br key={i} />
                ) : (
                  <span key={i}>{seg.t}</span>
                ),
              )}
            </Reveal>

            {/* Icons only; each link keeps its label for screen readers and the hover tooltip. -ml-2 lines the first icon up with the text above. */}
            <Reveal as="ul" className="-ml-2 mt-5 flex flex-wrap items-center gap-x-1 text-g500">
              {site.socials.map((s) => {
                const icon = socialNameFor(s.label);
                return (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${s.label} (opens in a new tab)`}
                      title={s.label}
                      className="grid h-9 min-w-9 place-items-center rounded-lg px-2 font-mono text-xs max-lg:h-11 max-lg:min-w-11 transition-[color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-g100 hover:text-ink"
                    >
                      {icon ? <SocialIcon name={icon} /> : s.label}
                    </a>
                  </li>
                );
              })}
            </Reveal>

            {site.available && (
              <Reveal className="mt-6">
                <Status>Available for new projects</Status>
              </Reveal>
            )}
          </div>
        </div>

        <LatestBuild />
      </header>

      {/* ───────── 01 — blog ───────── */}
      <Section id="blog" label="01 — blog" cta={{ label: "All posts", href: ctas.blog }}>
        <BlogList />
      </Section>

      {/* ───────── 02 — projects ───────── */}
      <Section id="projects" label="02 — projects" cta={{ label: "All projects", href: ctas.projects }}>
        <ProjectDeck projects={projects} />
      </Section>

      {/* ───────── 03 — experience (+ stack) ───────── */}
      <Section id="experience" label="03 — experience" cta={{ label: "Full history", href: ctas.experience }}>
        <Experience />
      </Section>

      {/* ───────── 04 — certifications ───────── */}
      <Section id="certifications" label="04 — certifications" cta={{ label: "All certifications", href: ctas.certifications }}>
        <Certifications />
      </Section>

      {/* ───────── 05 — recommendations ───────── */}
      <Section id="recommendations" label="05 — recommendations" cta={{ label: "All recommendations", href: ctas.recommendations }}>
        <Recommendations />
      </Section>

      {/* ───────── 06 — affiliations ───────── */}
      <Section id="affiliations" label="06 — affiliations" cta={{ label: "All affiliations", href: ctas.affiliations }}>
        <Affiliations />
      </Section>

      {/* ───────── 07 — github ───────── */}
      <Section
        id="github"
        label="07 — github"
        cta={site.githubUser ? { label: `@${site.githubUser} ↗`, href: githubHref } : undefined}
      >
        <GithubGrid />
      </Section>

      {/* ───────── Contact ───────── */}
      <Section id="contact" label="08 — contact" title="Let's make something good.">
        <Reveal as="p" className="mb-6 max-w-[34rem] text-g500">
          Have a project in mind, or just want to say hello? My inbox is open.
        </Reveal>
        {/* relative z-20: the email menu that can open here sits above the dotted band below the section */}
        <Reveal className="relative z-20 flex flex-wrap items-center gap-x-6 gap-y-3">
          <EmailButton email={site.email} className={btnPrimary}>
            Email me
          </EmailButton>
          <CopyEmail email={site.email} />
        </Reveal>
      </Section>

      {/* Closing halftone band */}
      <div aria-hidden className="halftone-fine mask-band mx-auto mt-24 h-24 w-full opacity-40" />

      {/* ───────── Footer ───────── */}
      <footer className="mt-8 flex items-center justify-between gap-4 border-t border-g200 pb-8 pt-6">
        <span className="micro text-g500">
          © {year} {site.name}
        </span>
        <a href="#top" className="micro text-g500 transition-colors duration-200 hover:text-ink max-lg:-my-3.5 max-lg:inline-block max-lg:py-3.5">
          Back to top ↑
        </a>
      </footer>
    </div>
  );
}
