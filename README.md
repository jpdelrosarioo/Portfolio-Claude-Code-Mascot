# Portfolio

Next.js (App Router) · React · Tailwind CSS v4 · TypeScript — styled with the **bryl-minimal** design language
(monochrome, typography-first, halftone texture, light/dark/system theming).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

## Make it yours

Everything you see is placeholder. All of it lives in **`data/site.ts`** — look for `EDIT`.

| To change | Do this |
|---|---|
| Name, email, intro, social links | `site` in `data/site.ts`. The intro is plain text mixed with `{ chip, icon }` pills. |
| **Your photo** | Drop it in `public/` (e.g. `public/me.jpg`) and set `portrait: "/me.jpg"`. Leave it empty for the placeholder silhouette. A square-ish, well-lit headshot works best. |
| Photo style | `portraitStyle`: `"halftone-color"` (dots keep your photo's colours), `"halftone"` (black and white dots) or `"color"` (the plain photo). |
| Photo crop | `portraitFocus: { x, y, zoom }` for the halftone styles. `x`/`y` are the centre as a fraction of the photo (0–1); raise `zoom` to crop closer to your face. The dot size and sharpening are `CELL` and `SHARPEN` at the top of `components/halftone-portrait.tsx`. |
| **GitHub dot grid** | Set `githubUser: "your-username"`. It then shows your real contributions (refreshed daily). Empty = sample data. |
| The wide card under the intro | `latestBuild` (same fields as a project) |
| **Project pictures** | Put files in `public/projects/`, then on a project set `image: "/projects/logo.png"` (small square logo / app icon, replaces the letters in the icon tile) and/or `cover: "/projects/screenshot.png"` (wide screenshot across the top of the card, cropped to 16:9 from the top). Works on `projects` and on `latestBuild`. |
| Blog rows, projects, experience, stack, certifications, recommendations, organizations | the arrays of the same names |
| "All posts →" style links | `ctas` |

Design values (colors, fonts, shadows, halftone) are in `app/globals.css`. Fonts are wired in `app/layout.tsx`
(Geist, Geist Mono, Source Serif 4 from Google Fonts; Geist Pixel is self-hosted in `app/fonts/`).

## Keyboard

- `Alt + K` (or `Ctrl/⌘ + K`): one box for everything. Type a question and press Enter to **ask the AI about you**, or pick a section, your email, the typing test or a theme from the list.
- `Alt + J`: a short **typing test** (speed, accuracy, your best score is remembered).
- The speaker button in the sidebar turns soft **UI sounds** on/off (off by default, remembered).

## "Ask anything" (AI)

Visitors can ask questions about you. The answers come only from the facts in `data/site.ts` (projects, experience, stack…), so keep that file filled in.
It calls the Groq API from a small server route (`app/api/ask/route.ts`), so your key is never sent to the browser. Visitors' questions are sent to Groq.

1. Get an API key at <https://console.groq.com/keys> and create a file `.env.local` in this folder (it is git-ignored):
   ```
   GROQ_API_KEY=your-key-here
   ```
   On Vercel: Project → Settings → Environment Variables. Without a key the chat politely says it isn't set up yet. Restart `npm run dev` after creating the file.
2. Optional settings (same place): `ASK_MODEL` (default `llama-3.3-70b-versatile`; try `llama-3.1-8b-instant` for faster, cheaper answers — if you get an error, check the current model names at <https://console.groq.com/docs/models>), `ASK_HOURLY_LIMIT` (questions per visitor per hour, default 15), `ASK_DAILY_LIMIT` (questions in total per day, default 300).
3. Hide it completely with `ask.enabled: false` in `data/site.ts`.

**Cost:** depends on your Groq plan — check the current free-tier limits and prices at <https://groq.com/pricing>. Don't put anything private in `data/site.ts`, since its contents are sent to the model with every question. The limits above cap how many calls the site makes.
The limits are kept in memory per server instance, so treat them as a safety net, not a hard guarantee.

Needs a server: it does not work with `output: "export"` (fully static hosting).

**Greeting and voice:** when the chat opens, the assistant greets the visitor (the wording is in `greeting()` in `components/ask-chat.tsx`, and it is free — no API call). Answers can be read aloud, sentence by sentence while they stream in, using the browser's built-in speech synthesis (`lib/speech.ts`). That costs nothing and sends nothing anywhere; the voice quality depends on the visitor's device. Visitors can mute it with the speaker button, and the choice is remembered. To make voice off by default, change `localStorage.getItem(KEY) !== "off"` to `=== "on"` in `lib/speech.ts`.

## Structure

```
app/            layout, page, global styles, favicon, fonts
components/     sidebar, mobile-nav, command-menu, halftone-portrait, project-deck, theme switch, sections…
data/site.ts    all the content
lib/            small helpers
legacy-static/  the first plain HTML/CSS/JS version (reference only — safe to delete)
```

## Deploy

Push to GitHub and import the repo on [Vercel](https://vercel.com) — no configuration needed.
For any static host, add `output: "export"` to `next.config.ts` and run `npm run build` (output goes to `out/`).
