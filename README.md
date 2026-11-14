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

## The mascot: moods, language understanding and moving around

- **It lives on the intro.** It perches on your name (where its chat box opens), and there it always either **sits or stands**, whichever its mood says: cheerful, excited, curious and proud mascots stand; calm, sleepy, sad and worried ones sit.
- **It walks about, but only on top edges** (`mascot.roam` in `data/site.ts`): the top of your portrait, the top of your name and the top of your intro text. Never over the middle of the picture and never down its sides. It strolls along them, walks across between the portrait and the name (they are level), hops down to the intro text and leaps back up, hops and dances when it is excited, dozes with a floating "z" at night, and goes back to its perch when someone talks to it (the chat box opens where it always has). On a phone, where the portrait, name and intro are stacked, the leaps between them are long and high. With reduced motion, or `roam: false`, it stays on the name and only sits or stands.
- **Its mood** (`lib/mood.ts`) starts from the time of day (bright in the morning, sleepy at night, a little different every visit), moves with what the visitor says, and settles back by itself; being alone for a long time tires it. A sad or worried visitor makes it sad or worried; kindness makes it glad and proud; a click cheers it up.
- **Language understanding** (`lib/nlp.ts`, runs in the browser, nothing is sent anywhere): it reads how the visitor feels (positive or negative, calm or worked up, and the emotion: joy, sadness, fear, stress, anger, tiredness, gratitude...) with negation ("not happy"), intensity ("so sad", "a bit tired"), "but", shouting and emoji, and what they mean (hello, thanks, goodbye, "how are you?", a compliment, an order for the mascot...).
- **It shines when God is mentioned.** When the visitor writes or says anything about God (God, Jesus, the Lord, the Bible, a prayer, a verse, "amen"...) or asks for a Bible reference such as "John 3:16", the mascot turns happy and a bright golden glow, with turning rays and little twinkles, lights up around its head and body for about 24 seconds (each new mention starts it again). If the visitor is sad or afraid it still shines, to comfort, but it does not put on a happy face over their sadness. The words are in `lib/nlp.ts` (`mentionsGod`), the mood in `lib/mood.ts`, the glow in `components/mascot-sprite.tsx` and `app/globals.css`. With reduced motion on, the glow stays still.
- **Instant answers** (`lib/mascot-replies.ts`, `mascot.quickReplies`): simple things are answered at once without the AI, in a way that fits its mood. "How are you?" is answered from how it really feels. You can give it orders: "sit down", "stand up", "go for a walk", "come here", "stay", "go to sleep", "dance", "jump", "wave". Anything else goes to the AI.
- **The AI is told how you seem to feel** and how the mascot feels (only a label from a fixed list is sent, never your words twice), so a sad visitor gets a gentle answer and a happy one gets a cheerful one..

## Talking to the mascot: microphone and "Hey Claude Code"

- **Microphone button** (in the mascot's chat box): speak instead of typing; the words appear in the box and are sent when you press send.
- **Hands-free, no button, no chat box needed**: say **"Hey Claude Code"** and the mascot waves and answers out loud. The chat box does **not** pop up by itself: everything works by voice, and you click the mascot only when you want to see the conversation (it opens with everything said so far). It listens by itself as soon as the page opens (the browser asks for the microphone the first time and remembers the answer), and a small dot on the mascot shows whenever the microphone is live (it pulses orange while the mascot is listening to you). There is nothing to switch on. Change the phrase or the pause in `mascot.wakeWord` in `data/site.ts` (`enabled: false` removes the feature).
- **A conversation**: the mascot answers out loud and then keeps listening, so you carry on talking without repeating the phrase. It ends when you say "bye" or "that’s all", stay quiet for 12 seconds (`followUpSeconds`) or close the mascot; the phrase starts a new one. Your message is sent when you stop talking (1.5 s, or sooner when the browser itself says the sentence is over).
- **Talking over the mascot**, like talking to a person: the moment your voice is clearly **louder** than the mascot’s own, it **stops** (mid-word) and **listens**. Whatever you say (a question, a new topic, even just "stop") is your message, and it answers that instead.
- **Nothing is lost when you interrupt**: the interrupted answer stays in the chat, cut where you interrupted it, and the AI is told where. Say **"continue"** (or "go on", "carry on what you were saying") straight away and the voice goes on from the same word; say it later and the mascot picks that answer up from where it stopped.
- **The mouth follows the words.** The mascot’s mouth opens and closes with each syllable it says (wide for "a" and "o", narrow for "e" and "i"), is shut in the pauses between words and sentences, and stops the instant the voice stops or is held. A browser voice gives no sound to measure, so `lib/mouth.ts` works out when each syllable is spoken from the text; it is lined up with the voice at every word the browser reports (most desktop voices do) and corrected to the voice’s real pace after every sentence. On a voice that reports no words (some online and Android voices) it is an estimate, corrected at the end of each sentence, so it can drift a little within one.
- **Its own voice never interrupts it.** The microphone also hears the mascot (and the "Ask anything" chat’s voice) through the speakers, so an interruption only counts when the microphone is clearly louder than the voice alone makes it. The loudness is a single number measured on your device (`lib/mic-level.ts`); no audio is recorded or sent. If it can’t be measured, only the phrase interrupts. A very quiet interruption can be missed; the phrase always works (`interrupt: false` turns voice interruption off; `conversation: false` makes every message need the phrase).

How it works: the browser's built-in speech recognition (Chrome, Edge, Safari; hidden in Firefox) listens, and `lib/wake-word.ts` looks for the phrase in what it hears (it forgives mishearings like "hey cloud code" but needs all three words). It only listens while the tab is visible, and the audio is never stored by this site. In Chrome and Edge the browser sends the audio to its own speech service while it listens. This is speech recognition, not an on-device keyword-spotting model: for fully offline detection you would add a WASM engine (for example Porcupine or openWakeWord) with a trained "Hey Claude Code" model.

## "Ask anything" (AI)

Visitors can ask questions about you. The answers come only from the facts in `data/site.ts` (projects, experience, stack…), so keep that file filled in.
It calls the Groq API from a small server route (`app/api/ask/route.ts`), so your key is never sent to the browser. Visitors' questions are sent to Groq.

1. Get an API key at <https://console.groq.com/keys> and create a file `.env.local` in this folder (it is git-ignored):
   ```
   GROQ_API_KEY=your-key-here
   ```
   On Vercel: Project → Settings → Environment Variables. Without a key the chat politely says it isn't set up yet. Restart `npm run dev` after creating the file.
2. Optional settings (same place): `ASK_MODEL` (default `llama-3.3-70b-versatile`; try `llama-3.1-8b-instant` for faster, cheaper answers — if you get an error, check the current model names at <https://console.groq.com/docs/models>), `ASK_HOURLY_LIMIT` ("Ask anything" questions per visitor per hour, default 15), `MASCOT_HOURLY_LIMIT` (the mascot, default 40: a spoken conversation is many short turns), `ASK_REASONING_EFFORT` (for gpt-oss models, default `low`: they answer much sooner), `ASK_DAILY_LIMIT` (questions in total per day, default 300).
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
