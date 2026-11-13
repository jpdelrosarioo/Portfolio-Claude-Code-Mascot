// All the words on the site live here. Edit this file — not the components.
// Everything marked EDIT is placeholder content for you to replace.

import type { AiLogoName } from "@/components/ai-logos";
import type { IconName } from "@/components/icons";

/** A piece of the intro sentence: plain text, a pill with an icon, a cluster of AI logos + label, or a line break. */
export type Segment =
  | { t: string }
  | { br: true } // starts a new line
  | { chip: string; icon?: IconName } // icon is optional
  | { logos: AiLogoName[]; label?: string }; // logos: "gemini" | "openai" | "claude" | "groq" | "devin"

/** A sprite sheet of frames for the portrait video (see `site.portraitFrames`). Sizes are in pixels of the image. */
export type PortraitFrames = {
  src: string;
  columns: number; // frames per row
  frames: number; // frames in total, read left to right, top to bottom
  left: number; // where the first frame starts
  top: number;
  width: number; // size of one frame
  height: number;
  stepX: number; // from one frame's left edge to the next
  stepY: number;
  /** Fraction of each frame trimmed from each side (the black gutters and the frame numbers). */
  inset: { top: number; right: number; bottom: number; left: number };
  fps: number; // frames per second when the theme changes
  focus: { x: number; y: number; zoom: number };
};

export const site = {
  name: "JP del Rosario",
  title: "JP del Rosario — AI Software Engineer", // EDIT
  description: "JP Del Rosario — developer and designer building modern web and mobile products.", // EDIT
  email: "delrosarioo.jp@gmail.com", // EDIT
  available: true,
  /** Path to your photo in /public (e.g. "/me.jpg"). Leave empty to show the placeholder silhouette. */
  portrait: "/projects/Profile.png", // EDIT
  /** A different photo shown while dark mode is on (same crop settings as above). Leave empty to use `portrait` in both modes. */
  portraitDark: "/projects/Profile-2.jpg",
  /** "dots-bw": black-and-white dots, identical in light and dark mode, no border.
   *  "dots": same dots in your photo's own colours (with a thin border).
   *  "halftone-color" / "halftone": coarser halftone whose look follows the theme.  "color": your photo as it is. */
  portraitStyle: "dots-bw" as "dots-bw" | "dots" | "halftone-color" | "halftone" | "color",
  /** Which part of the photo the halftone shows: centre x/y as a fraction of the photo (0–1) and zoom (1 = whole photo).
   *  Raise zoom to crop closer to your face; move x/y to re-centre. */
  portraitFocus: { x: 0.47, y: 0.5, zoom: 1.4 },
  /** A video made from a sprite sheet: light mode shows the first frame (sunglasses on), dark mode the last (off), and
   *  switching theme plays the frames in between. Set it to `undefined` to use `portrait` / `portraitDark` instead. */
  portraitFrames: {
    src: "/projects/Portrait frames.jpg",
    columns: 3,
    frames: 6,
    left: 23,
    top: 19,
    width: 879,
    height: 730,
    stepX: 913.5,
    stepY: 769,
    inset: { top: 0.11, right: 0.08, bottom: 0.05, left: 0.05 },
    fps: 50,
    focus: { x: 0.5, y: 0.45, zoom: 1.05 },
  } as PortraitFrames | undefined,
  /** Your GitHub username. Leave empty to show sample data in the contribution grid. */
  githubUser: "jpdelrosarioo", // EDIT
  /** Intro sentence. Plain text mixed with inline chips. */
  intro: [
    { t: "I'm a " },
    { chip: "Student" },
    { t: " and aspiring AI software engineer " },
    { logos: ["gemini", "openai", "claude", "groq"] },
    { t: ". I love testing new " },
    { chip: "Technology", icon: "cpu" },
    { t: " & " },
    { chip: "Application", icon: "app" },
    { t: ", and these days I'm focused on " },
    { t: "generative AI" },
    { t: "." },
    { br: true },
    { t: "Right now I'm building my " },
    { chip: "foundations", icon: "zap" },
    { t: " every day, and I love turning what I learn into " },
    { chip: "things", icon: "pen" },
    { t: " people can actually use." },
  ] as Segment[], // EDIT 
  /** Shown as icons. A label of github, linkedin, instagram or x (twitter) gets its logo; any other label stays as text. */
  socials: [
    { label: "github", href: "https://github.com/jpdelrosarioo" },
    { label: "linkedin", href: "https://www.linkedin.com/in/jpdelrosarioo" },
    { label: "instagram", href: "https://www.instagram.com/jp.delrosarioo" },
    { label: "x", href: "https://x.com/benihotdog" },
  ], // EDIT
  contactBlurb: "For work, collabs & everything else, reach me at",
};

/* ---------- Navigation ---------- */
export const nav = {
  // Icon links
  pages: [
    { id: "blog", label: "Blog", icon: "blog" },
    { id: "projects", label: "Projects", icon: "projects" },
    { id: "contact", label: "Contact", icon: "mail" },
  ] as { id: string; label: string; icon: IconName }[],
  // In-page sections (text links)
  sections: [
    { id: "experience", label: "Experience" },
    { id: "stack", label: "Stack" },
    { id: "certifications", label: "Certifications" },
    { id: "recommendations", label: "Recommendations" },
    { id: "organizations", label: "Organizations" },
    { id: "github", label: "GitHub" },
  ] as { id: string; label: string }[],
};

/** Flat list in page order — used by the mobile menu, scroll-spy and the command menu. */
export const navItems: { id: string; label: string }[] = [
  { id: "top", label: "Home" },
  ...nav.pages.filter((p) => p.id !== "contact"),
  ...nav.sections,
  { id: "contact", label: "Contact" },
];

/* ---------- Newest build (the wide card under the intro) ---------- */
// EDIT: your newest app. Same fields as a project below.
export const latestBuild: Project = {
  title: "My newest app",
  description: "What it is, who it's for, and the part you're proudest of. One or two sentences about the app you built most recently.",
  mark: "N1",
  badges: ["New", "Mobile app"],
  links: [{ label: "Visit", href: "#" }, { label: "Source", href: "#" }],
};

/* ---------- 01 — blog ---------- */
export const posts = [
  { title: "A post title goes here", excerpt: "One line that tells the reader why this is worth their time and what they'll take away from it.", date: "Oct 2026", href: "#" },
  { title: "Another thing I learned", excerpt: "A short summary of the story, the lesson, or the thing you built and how it went.", date: "Sep 2026", href: "#" },
  { title: "How I built something small", excerpt: "Walk through the idea, the stack, and the part that surprised you along the way.", date: "Aug 2026", href: "#" },
]; // EDIT

/* ---------- 02 — projects ---------- */
export type Project = {
  title: string;
  description: string;
  mark: string; // one- or two-letter monogram shown as the icon (used when there is no `image`)
  /** Optional square logo / app icon in /public, e.g. "/projects/my-app-icon.png". Replaces the monogram. */
  image?: string;
  /** Optional screenshot in /public, e.g. "/projects/my-app.png". Shown across the top of the card (16:9, cropped from the top). */
  cover?: string;
  badges: string[]; // first one is highlighted (e.g. "#1 Finance app")
  links: { label: string; href: string }[];
};

export const projects: Project[] = [
  {
    title: "Cafe Rencontre",
    description: "An online BARCIE cafe ordering system.",
    mark: "P1",
    image: "/projects/Cafe Rencontre Logo.png",
    badges: ["#1 Category", "First CRUD Project"],
    links: [{ label: "Visit", href: "https://caferecontre.vercel.app/" }, { label: "Source", href: "https://github.com/jpdelrosarioo/Cafe-Rencontre-Demo" }],
  },
  {
    title: "Student Information System",
    description: "A companion tool that helps organization stay consistent. Clean data, continous workflows.",
    mark: "P2",
    image: "/projects/Students Information Logo.png",
    badges: ["#2", "BSIT SYSTEM"],
    links: [{ label: "Visit", href: "https://students-bsit-system.vercel.app" }, {label: "Source", href: "https://github.com/jpdelrosarioo/CRUD-TESTING"}],
  },
  {
    title: "Syllabus Management System",
    description: "Build, validate, review, approve, archive, and analyze undergraduate syllabi by AI driven in one institutional workspace.",
    mark: "P3",
    image: "/projects/cite-logo.png",
    badges: ["New", "CAPSTONE"],
    links: [{ label: "Visit", href: "#" }],
  },
]; // EDIT

/* ---------- 03 — experience ---------- */
export const experience = [
  { year: "2026", role: "Student", company: "LCUP" },
  { year: "2025", role: "Community Helper", company: "Yield Guild Games"},
  { year: "2025", role: "Junior Moderator", company: "Public AI" },
]; // EDIT

/** Your technologies, grouped. Add or remove items freely; a group with no items is hidden. */
export const stack: { group: string; items: string[] }[] = [
  { group: "Frontend", items: ["TypeScript", "React", "Next.js", "Tailwind"] },
  { group: "Backend", items: ["Node.js", "Python"] },
  { group: "Databases", items: ["MySQL"] },
  { group: "AI", items: ["Gemini", "Claude Code", "ChatGPT", "Codex", "Claude", "Antigravity", "Anthropic", "OpenAI"] },
  { group: "Tools", items: ["Git", "GitHub"] },
  { group: "IDE & Editors", items: ["VS Code", "PyCharm"] },
]; // EDIT

/* ---------- 04 — certifications ---------- */
export const certifications = [
  { title: "Microsoft Access Expert", issuer: "MICROSOFT", mark: "/projects/microsoft.svg", href: "https://www.credly.com/badges/4c859430-e6de-48b8-a1db-a12f6afbf74f/public_url" },
  { title: "Excel Associate", issuer: "MICROSOFT", mark: "/projects/microsoft.svg", href: "https://www.credly.com/badges/7a8f0a99-7bb9-481e-8e02-d1edc896bc3e/public_url" },
  { title: "Foundational C# with Microsoft", issuer: "MICROSOFT", mark: "/projects/microsoft.svg", href: "https://www.freecodecamp.org/certification/jprizaldelrosario/foundational-c-sharp-with-microsoft" },
]; // EDIT

/* ---------- 05 — recommendations ---------- */
export const recommendations = [
  { quote: "A short, genuine quote from someone you worked with about what you're like to work with.", name: "Person One", role: "Title, Company" },
  { quote: "It was a real pleasure to work together. Consistently delivers and makes the whole team better.", name: "Person Two", role: "Title, Company" },
  { quote: "One of the most talented people I've mentored. A fast learner who always finishes what they start.", name: "Person Three", role: "Title, Company" },
]; // EDIT

/* ---------- 06 — Organizations ---------- */
export const Organizations = [
  { name: "JPSSITE", role: "Member", mark: "/projects/JPSSITE.jpg" },
  { name: "APP BUILDERS PH", role: "Member", mark: "/projects/App Builders PH.jpg" },
  { name: "DATING BAYARAN", role: "MEMBER", mark: "/projects/Dating Bayaran.jpg" },
]; // EDIT

/* ---------- Section links ("All posts →") ---------- */
// EDIT: point these at real pages when you have them
export const ctas = {
  blog: "blog",
  projects: "projects",
  experience: "experience",
  certifications: "certifications",
  recommendations: "recommendations",
  organizations: "organizations",
};

/* ---------- "Ask anything" (AI chat) ---------- */
// The answers come from the facts in this file (see lib/ask-context.ts), so keep the sections above up to date.
// Needs GEMINI_API_KEY on your host — see README. Set enabled: false to hide it.
/* ---------- The little mascot sitting on your name ---------- */
// It greets visitors, asks how they are, and shares a verse about God's faithfulness. Verses are from the King James
// Version (public domain, free to use on a website). Set enabled: false to hide it.
export const mascot = {
  enabled: true,
  /** Open and greet by itself once per visit. Off: the mascot only speaks when someone clicks it. */
  autoGreet: false,
  greeting: "Hi there! 👋 Welcome to my portfolio.",
  question: "Are you doing okay today?",
  /** Shown when the visitor answers "I'm okay". */
  okay: [
    { text: "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.", ref: "Lamentations 3:22–23" },
    { text: "Know therefore that the LORD thy God, he is God, the faithful God, which keepeth covenant and mercy with them that love him and keep his commandments to a thousand generations.", ref: "Deuteronomy 7:9" },
    { text: "Thy mercy, O LORD, is in the heavens; and thy faithfulness reacheth unto the clouds.", ref: "Psalm 36:5" },
    { text: "But the Lord is faithful, who shall stablish you, and keep you from evil.", ref: "2 Thessalonians 3:3" },
    { text: "Let us hold fast the profession of our faith without wavering; (for he is faithful that promised;)", ref: "Hebrews 10:23" },
    { text: "God is faithful, by whom ye were called unto the fellowship of his Son Jesus Christ our Lord.", ref: "1 Corinthians 1:9" },
  ],
  /** Shown when the visitor answers "Not really". */
  notOkay: [
    { text: "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.", ref: "Lamentations 3:22–23" },
    { text: "And the LORD, he it is that doth go before thee; he will be with thee, he will not fail thee, neither forsake thee: fear not, neither be dismayed.", ref: "Deuteronomy 31:8" },
    { text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.", ref: "Isaiah 41:10" },
    { text: "The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.", ref: "Psalm 34:18" },
    { text: "Casting all your care upon him; for he careth for you.", ref: "1 Peter 5:7" },
  ],
};

export const ask = {
  enabled: true,
  /** Your own blocked words or phrases, on top of the built-in filter for bad words, spam and harmful requests
   *  (see lib/moderation.ts). Example: ["some word", "another phrase"]. */
  blockedWords: [] as string[], // EDIT
  suggestions: ["What are you building right now?", "What's your tech stack?", "How can I work with you?"], // EDIT
};

/* ---------- The cursor tour: an animated cursor that glides over the page and explains each part ---------- */
export type TourStop = {
  /** CSS selector of what the cursor points at (a stop whose element isn't on screen, like a hidden sidebar, is skipped). */
  target: string;
  title: string;
  text: string;
  /** "dust": the cursor also touches the portrait, so it turns to dust and comes back. */
  action?: "dust";
};
export const tour = {
  enabled: true,
  /** Start the tour by itself the first time someone opens the site (it is remembered in their browser, so only once). */
  autoStart: true,
  /** How long after the page opens it starts (ms). */
  autoStartDelay: 2500,
  /** The name tag that follows the cursor. */
  cursorLabel: "JP", // EDIT
  stops: [
    { target: "header#top h1", title: "Hi, I'm JP 👋", text: "Welcome! I'm a student and aspiring AI software engineer. Let me show you around: it takes about a minute." },
    { target: 'button[aria-label^="Say hi"], button[aria-label^="Close the mascot"]', title: "Meet the mascot", text: "This little guy sits on my name. Click it and it says hi, asks how you are, and shares a Bible verse about God's faithfulness. You can even ask it for any verse." },
    { target: 'header#top canvas[role="img"]', title: "Try touching my photo", text: "Move your cursor over the portrait and it turns to dust, then comes back together. Switch the theme and the glasses come off (or on).", action: "dust" },
    { target: "header#top p", title: "What I'm up to", text: "What I'm focused on right now, and the AI tools I like to build with." },
    { target: "#blog", title: "Blog", text: "Notes and write-ups about what I'm learning and building." },
    { target: "#projects", title: "Projects", text: "Things I've made. Click a card to see what it is and how it's built." },
    { target: "#experience", title: "Experience & stack", text: "Where I've worked and the tools I use, grouped by frontend, backend, databases, AI and tools." },
    { target: "#certifications", title: "Certifications", text: "Credentials I've earned. Each card links to its public verification page." },
    { target: "#organizations", title: "Organizations", text: "The communities and groups I'm part of." },
    { target: "#github", title: "GitHub activity", text: "My contribution graph, synced live from GitHub." },
    { target: '[data-tour="ask"]', title: "Ask anything", text: "Press Alt + K to ask an AI assistant about me, my work or my stack. It can read its answers out loud." },
    { target: '[data-tour="theme"]', title: "Light, dark or system", text: "Pick the look you like. The portrait changes with it." },
    { target: "#contact", title: "Let's talk", text: "That's the tour! If you'd like to work together, email me from here, or press Alt + T any time to take the tour again." },
  ] as TourStop[], // EDIT
};
