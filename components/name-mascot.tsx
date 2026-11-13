"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mascot, site, tour } from "@/data/site";
import { findReference, lookUp, markedReferences, withoutMarkers, type VerseLookup } from "@/lib/bible";
import { moderate, moderationMessage } from "@/lib/moderation";
import { tourSeen, tourWillAutoStart } from "@/lib/tour-state";
import { isSpeaking, sentenceBoundary, speak, speechSupported, stopSpeaking, type SpeechEvent } from "@/lib/speech";
import { Icon } from "./icons";

type Verse = { text: string; ref: string };
type Step = "hidden" | "greet" | "ask" | "verse" | "chat";
/** `local`: shown in the bubble but never sent to the AI (a blocked message and the mascot's reply to it). */
type Msg = { role: "user" | "assistant"; content: string; local?: boolean };

const SEEN = "mascot-greeted"; // the greeting opens by itself once per visit; afterwards the mascot is clicked to talk
const VOICE_KEY = "mascot-voice"; // the visitor's choice: the mascot speaks out loud, or not
const VOICE = { pitch: 1.35, rate: 1.05 }; // a little higher and brighter than the chat voice: a small, cheerful character
const noSubscribe = () => () => {};

// How fast the words appear when no voice is leading (characters per millisecond: about the old typing speed)...
const FAST = 0.045;
// ...and while the voice is speaking: an average speaking speed, corrected after every sentence from what was measured
const PACE = 0.0145 * VOICE.rate;
// If the voice has not started within this many milliseconds, the words stop waiting for it
const STALL = 2200;

type Track = {
  shown: number; // characters on screen (fractional while moving)
  want: number; // characters that have been handed over to be said
  segEnd: number; // how far the voice has got: the words never run past it while it is speaking
  pace: number;
  t0: number;
  last: number;
  voiced: boolean;
  active: boolean;
  words: boolean; // this voice reports each word, so its position is exact
  token: number; // changes with every new text, so a voice still finishing the old one is ignored
};

/**
 * Text that appears in step with the voice that reads it. The words are revealed as the voice speaks them (to the word
 * when the voice reports its words, otherwise at a speaking pace that is corrected after every sentence) and never run
 * ahead of it. Without a voice (muted, unsupported, blocked by the browser) they simply appear quickly, like typing.
 */
function useSpokenText() {
  const [n, setN] = useState(0);
  const [talking, setTalking] = useState(false);
  const r = useRef<Track>({ shown: 0, want: 0, segEnd: 0, pace: PACE, t0: 0, last: 0, voiced: false, active: false, words: false, token: 0 });
  const quiet = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let prev = performance.now();
    const id = window.setInterval(() => {
      const s = r.current;
      const now = performance.now();
      const dt = now - prev;
      prev = now;
      const waiting = s.voiced && (s.active || now - s.last < STALL);
      const limit = waiting ? s.segEnd : s.want;
      if (s.shown >= limit) return;
      const speed = !waiting ? FAST : s.words ? s.pace * 2 : s.pace;
      s.shown = reduce ? limit : Math.min(limit, s.shown + speed * dt);
      setN(Math.floor(s.shown));
    }, 33);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(quiet.current);
    };
  }, []);

  /** A new text starts: nothing is on screen yet. `voiced`: a voice is going to read it. */
  const begin = useCallback((voiced: boolean) => {
    const s = r.current;
    Object.assign(s, { token: s.token + 1, shown: 0, want: 0, segEnd: 0, pace: PACE, voiced, active: false, words: false, last: performance.now() });
    setN(0);
  }, []);
  /** The text now reaches `to` characters (they are shown as soon as the voice says them). */
  const grow = useCallback((to: number) => {
    const s = r.current;
    s.want = Math.max(s.want, to);
    if (!s.active) s.last = performance.now();
  }, []);
  /** The voice was switched off: show the rest without waiting for it. */
  const release = useCallback((to: number) => {
    const s = r.current;
    s.voiced = false;
    s.want = Math.max(s.want, to);
  }, []);
  const token = useCallback(() => r.current.token, []);
  /** What the voice reports for the piece of text that sits at characters `from`–`to`. */
  const heard = useCallback((tok: number, from: number, to: number, e: SpeechEvent) => {
    const s = r.current;
    if (tok !== s.token) return;
    const now = performance.now();
    s.last = now;
    if (e.type === "start") {
      s.active = true;
      s.words = false;
      s.t0 = now;
      s.segEnd = to;
      s.shown = Math.max(s.shown, from);
      window.clearTimeout(quiet.current);
      setTalking(true);
    } else if (e.type === "word" || e.type === "chunk") {
      s.active = true;
      if (e.type === "word") s.words = true;
      if (s.words) s.segEnd = Math.min(to, from + e.fraction * (to - from));
      window.clearTimeout(quiet.current);
      setTalking(true);
    } else if (e.type === "end") {
      s.active = false;
      // when this was the last thing the voice had to say, whatever is left (a trailing emoji, say) can appear too
      s.segEnd = isSpeaking() ? to : Math.max(to, s.want);
      const took = now - s.t0;
      if (!s.words && took > 300 && to - from > 15) s.pace = Math.min(0.03, Math.max(0.008, (s.pace + (to - from) / took) / 2));
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(() => setTalking(false), 220); // a short breath between sentences is not a pause
    } else {
      s.active = false;
      s.last = -1e9; // the voice cannot speak: stop waiting for it
      setTalking(false);
    }
  }, []);

  return { n, talking, begin, grow, release, token, heard };
}

const pick = (list: Verse[], not?: Verse) => {
  const options = list.length > 1 && not ? list.filter((v) => v.ref !== not.ref) : list;
  return options[Math.floor(Math.random() * options.length)];
};

/** What the mascot says when a verse can't be shown. */
function verseTrouble(v: { reference: string; error: string }) {
  if (v.error === "not_found" || v.error === "bad_reference")
    return `I couldn't find “${v.reference}”. Try a reference like John 3:16 or Psalm 23.`;
  if (v.error === "rate_limited") return "That's a lot of verses! Let's pause for a moment and try again.";
  return "I couldn't open the Bible just now. Please try again in a moment.";
}

// what the mascot says when it can't reach the AI
const TROUBLE: Record<string, string> = {
  not_configured: "I can't chat right now, but I'm really glad you stopped by. 🙂",
  rate_limited: "Let's take a little break. Talk to me again in a bit?",
  upstream: "I lost my words for a second. Could you try again?",
};

/**
 * A small pixel mascot (inspired by the Claude Code mascot) sitting on top of the surname, swinging its legs. Its mouth
 * moves while it talks.
 */
function Mascot({ waving, talking }: { waving: boolean; talking: boolean }) {
  const body = "#D97757"; // Claude coral
  return (
    <svg viewBox="0 0 16 14" shapeRendering="crispEdges" aria-hidden className="block h-[35px] w-10 overflow-visible">
      {/* legs dangle over the edge of the letters */}
      <rect className="mascot-leg" x="4" y="9" width="1" height="4" fill={body} />
      <rect className="mascot-leg mascot-leg-alt" x="6" y="9" width="1" height="4" fill={body} />
      <rect className="mascot-leg" x="9" y="9" width="1" height="4" fill={body} />
      <rect className="mascot-leg mascot-leg-alt" x="11" y="9" width="1" height="4" fill={body} />
      <g className="mascot-bob">
        <rect x="3" y="2" width="10" height="7" fill={body} />
        <rect x="1" y="5" width="2" height="2" fill={body} />
        <rect className={waving ? "mascot-wave" : undefined} x="13" y="5" width="2" height="2" fill={body} />
        <rect className="mascot-eye" x="5" y="4" width="1" height="2" fill="#141414" />
        <rect className="mascot-eye" x="10" y="4" width="1" height="2" fill="#141414" />
        {talking && <rect className="mascot-mouth" x="7" y="7" width="2" height="1" fill="#141414" />}
      </g>
    </svg>
  );
}

/** The page title (your name) with the mascot sitting on the surname. The mascot and its bubble sit next to the heading,
 *  not inside it, so screen readers still read the heading as just your name. */
export function NameMascot({ name, className }: { name: string; className?: string }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const surname = rest.join(" ");
  const surnameRef = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number; width: number; em: number; room: number } | null>(null);

  // keep the mascot lined up with the surname (it moves when the layout or the font size changes)
  useEffect(() => {
    const el = surnameRef.current;
    if (!el) return;
    const measure = () =>
      setSpot({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        em: parseFloat(getComputedStyle(el).fontSize),
        // how far the speech bubble may reach to the right: the edge of the screen (minus the page margin)
        room: window.innerWidth - el.parentElement!.getBoundingClientRect().left - 16,
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(el.parentElement!);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [surname]);

  const [step, setStep] = useState<Step>("hidden");
  const [answer, setAnswer] = useState<"okay" | "notOkay">("okay");
  const [verse, setVerse] = useState<Verse | null>(null);
  const [waving, setWaving] = useState(false);
  const [voice, setVoice] = useState(true);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<VerseLookup[]>([]); // verses looked up for the latest message
  const [units, setUnits] = useState(0); // how many of those verses have been read out so far (shown as they are read)
  const [minimized, setMinimized] = useState(false); // the bubble shrunk to its title bar (the mascot keeps talking)
  const [pos, setPos] = useState({ x: 0, y: 0 }); // how far the visitor has dragged the bubble from its place under the name
  const [dragging, setDragging] = useState(false);
  const endDrag = useRef<(() => void) | null>(null); // stops following the pointer (a drag in progress)
  const justDragged = useRef(false);
  const reveal = useSpokenText();
  const bodyRef = useRef<HTMLSpanElement>(null);
  const stick = useRef(true); // keep the bubble scrolled to the newest words, unless the visitor scrolled up
  const timer = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const voiceRef = useRef(true);

  const canSpeak = useSyncExternalStore(noSubscribe, speechSupported, () => false);

  // the visitor's voice choice is remembered
  useEffect(() => {
    try {
      const on = localStorage.getItem(VOICE_KEY) !== "off";
      setVoice(on);
      voiceRef.current = on;
    } catch {}
  }, []);

  const { begin, grow, release, token, heard } = reveal;
  const voiced = () => voiceRef.current && speechSupported();

  /**
   * Says something out loud in the mascot's voice (if the visitor has the voice on).
   * `at`: this text sits at that character of the text on screen, which then appears as the voice says it.
   * `onEvent`: follows the voice (used to show each verse as it is read).
   */
  const say = useCallback(
    (text: string, { queue = false, at, onEvent }: { queue?: boolean; at?: number; onEvent?: (e: SpeechEvent) => void } = {}) => {
      const to = at === undefined ? 0 : at + text.length;
      if (at !== undefined) grow(to);
      if (!text) return;
      if (!voiceRef.current || !speechSupported()) {
        onEvent?.({ type: "error", fraction: 0 });
        return;
      }
      if (!queue) stopSpeaking();
      const tok = token();
      speak(text, {
        ...VOICE,
        onSpeech: (e) => {
          if (at !== undefined) heard(tok, at, to, e);
          onEvent?.(e);
        },
      });
    },
    [grow, heard, token],
  );

  /** A new line on screen (the greeting, a question, ...), said and shown together. */
  const speakLine = useCallback(
    (line: string, queue = false) => {
      begin(voiceRef.current && speechSupported());
      say(line, { queue, at: 0 });
    },
    [begin, say],
  );

  const lines: Record<Step, string> = {
    hidden: "",
    greet: mascot.greeting,
    ask: mascot.question,
    verse: answer === "okay" ? "Glad to hear it! Here's a verse for you:" : "I'm sorry it's been hard. You're not alone. Here's a verse for you:",
    chat: "",
  };
  const line = lines[step];
  const shown = line.slice(0, reveal.n);
  const done = line.length > 0 && reveal.n >= line.length;

  const greet = useCallback(() => {
    setWaving(true);
    window.setTimeout(() => setWaving(false), 2800);
    setStep("greet");
    setMinimized(false);
    speakLine(mascot.greeting);
  }, [speakLine]);

  const close = useCallback(() => {
    setPos({ x: 0, y: 0 }); // it opens in its usual place next time
    setStep("hidden");
    stopSpeaking();
    abort.current?.abort();
  }, []);

  // greet by itself once per visit, a moment after the page appears. (Browsers only allow speech after the visitor has
  // clicked or tapped something, so this first greeting may be silent; everything after a click is spoken.)
  useEffect(() => {
    if (!mascot.enabled) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return;
    const hello = () => {
      try {
        sessionStorage.setItem(SEEN, "1");
      } catch {}
      greet();
    };
    if (tourWillAutoStart()) {
      // A first visit: the tour goes first, and the mascot says hello once it is over (or at once if the tour never started).
      const onEnd = () => {
        timer.current = window.setTimeout(hello, 2200);
      };
      window.addEventListener("tour-end", onEnd, { once: true });
      const fallback = window.setTimeout(() => {
        if (!tourSeen()) hello();
      }, tour.autoStartDelay + 1500);
      return () => {
        window.removeEventListener("tour-end", onEnd);
        window.clearTimeout(fallback);
        window.clearTimeout(timer.current);
      };
    }
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {}
    timer.current = window.setTimeout(greet, 1400);
    return () => window.clearTimeout(timer.current);
  }, [greet]);

  // after the greeting has been typed, move on to the question
  useEffect(() => {
    if (step !== "greet" || !done) return;
    const id = window.setTimeout(() => {
      setStep("ask");
      speakLine(mascot.question, true);
    }, 900);
    return () => window.clearTimeout(id);
  }, [step, done, speakLine]);

  // the layout changed (turned the phone, resized the window): put the bubble back where it belongs
  useEffect(() => {
    const back = () => setPos({ x: 0, y: 0 });
    window.addEventListener("resize", back);
    return () => window.removeEventListener("resize", back);
  }, []);

  // Escape closes the bubble; leaving the page stops the voice
  useEffect(() => {
    if (step === "hidden") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, close]);
  useEffect(() => () => {
    endDrag.current?.();
    stopSpeaking();
    abort.current?.abort();
  }, []);

  const showVerse = (a: "okay" | "notOkay", previous?: Verse) => {
    const v = pick(a === "okay" ? mascot.okay : mascot.notOkay, previous);
    setVerse(v);
    return v;
  };

  const reply = (a: "okay" | "notOkay") => {
    setMinimized(false);
    setAnswer(a);
    const v = showVerse(a);
    setStep("verse");
    speakLine(a === "okay" ? "Glad to hear it! Here's a verse for you:" : "I'm sorry it's been hard. You're not alone. Here's a verse for you:");
    say(`${v.text} ${v.ref}.`, { queue: true });
  };

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    voiceRef.current = on;
    try {
      localStorage.setItem(VOICE_KEY, on ? "on" : "off");
    } catch {}
    if (!on) {
      stopSpeaking();
      release(line.length);
      setUnits(Infinity);
    }
  };

  /**
   * Reads verses aloud: the reference, then the words (a long passage: the first few verses, the rest is on screen).
   * Each verse appears on screen as the voice starts reading it.
   */
  const readVerses = (list: VerseLookup[], intro = "") => {
    const showUpTo = (k: number) => (e: SpeechEvent) => {
      if (e.type === "start" || e.type === "error") setUnits((u) => Math.max(u, k));
    };
    if (intro) say(intro, { queue: true, at: 0 });
    let base = 0;
    for (const v of list) {
      if ("error" in v) {
        say(verseTrouble(v), { queue: true, onEvent: showUpTo(base + 1) });
        base += 1;
        continue;
      }
      if (!intro) say(`${v.reference}.`, { queue: true }); // (with an intro, the reference was just said)
      v.verses.slice(0, 6).forEach((x, j) => say(x.text, { queue: true, onEvent: showUpTo(base + j + 1) }));
      if (v.verses.length > 6) say("… and more on the screen.", { queue: true, onEvent: showUpTo(base + v.verses.length) });
      base += v.verses.length;
    }
  };

  // Safety net: verses wait for the voice, but if nothing is being said (muted, blocked by the browser) show them all
  useEffect(() => {
    if (!cards.length || units === Infinity) return;
    const id = window.setInterval(() => {
      if (!isSpeaking()) setUnits(Infinity);
    }, 400);
    return () => window.clearInterval(id);
  }, [cards, units]);

  // keep the newest words in view while the bubble fills up (unless the visitor has scrolled up to read)
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [reveal.n, units, cards, history, step]);

  // The visitor writes to the mascot: it reads the message and answers through the AI, in its own caring voice.
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMinimized(false);
    setStep("chat");
    stick.current = true;

    // the same filter as the chat: bad words, spam, harmful requests get a kind, instant answer and are never sent
    const why = moderate(text);
    if (why) {
      const msg = moderationMessage(why, site.name) ?? "Let's keep it kind. 🙂";
      // kept out of the conversation sent to the AI, so one blocked message doesn't get every later message blocked too
      setHistory((h): Msg[] =>
        [...h, { role: "user" as const, content: text, local: true }, { role: "assistant" as const, content: msg, local: true }].slice(-8),
      );
      setCards([]);
      begin(voiced());
      say(msg, { at: 0 });
      return;
    }

    setCards([]);
    stopSpeaking();
    begin(voiced());
    const controller = new AbortController();
    abort.current = controller;

    // The visitor typed a reference ("John 3:16", "Psalm 23"): look it up straight away, no AI needed.
    const direct = findReference(text);
    if (direct) {
      setHistory((h): Msg[] =>
        [...h, { role: "user" as const, content: text, local: true }, { role: "assistant" as const, content: "", local: true }].slice(-8),
      );
      setBusy(true);
      const found = await lookUp(direct, controller.signal);
      setBusy(false);
      if ("error" in found && found.error === "aborted") return;
      // "Here's Psalms 23:" with the proper name, or nothing when it wasn't found (the card explains)
      const intro = "error" in found ? "" : `Here's ${found.reference}:`;
      setHistory((h) => {
        const copy = h.slice();
        copy[copy.length - 1] = { role: "assistant", content: intro, local: true };
        return copy;
      });
      setCards([found]);
      setUnits(voiced() ? 0 : Infinity);
      readVerses([found], intro.replace(/:$/, "."));
      return;
    }

    const next: Msg[] = [...history, { role: "user" as const, content: text }].slice(-8);
    setHistory([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    let answerText = "";
    let spoken = 0;
    const update = (t: string) =>
      setHistory((h) => {
        const copy = h.slice();
        copy[copy.length - 1] = { role: "assistant", content: t };
        return copy;
      });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "mascot",
          messages: next.filter((m) => m.content && !m.local).map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const code = data?.error ?? "upstream";
        throw new Error(TROUBLE[code] ?? moderationMessage(code, site.name) ?? TROUBLE.upstream);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        answerText += decoder.decode(value, { stream: true });
        update(answerText);
        // speak each sentence as soon as it is complete ([[references]] are read as plain references); the words on
        // screen follow the voice
        const clean = withoutMarkers(answerText);
        const cut = sentenceBoundary(clean, spoken);
        if (cut > spoken) {
          say(clean.slice(spoken, cut), { queue: true, at: spoken });
          spoken = cut;
        }
      }
      const clean = withoutMarkers(answerText);
      if (spoken < clean.length) say(clean.slice(spoken), { queue: true, at: spoken });

      // The AI only chose the references; the exact King James text is fetched here and shown below its words.
      const refs = markedReferences(answerText);
      if (refs.length) {
        const found = await Promise.all(refs.map((r) => lookUp(r, controller.signal)));
        const shown = found.filter((f) => !("error" in f && f.error === "aborted"));
        setCards(shown);
        setUnits(voiced() ? 0 : Infinity);
        readVerses(shown);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const msg = (e as Error).message || TROUBLE.upstream;
        update(msg);
        begin(voiced());
        say(msg, { at: 0 });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!mascot.enabled || !surname) return <h1 className={className}>{name}</h1>;

  // Where the speech bubble goes: under the name, lined up with the end of the surname when there is room, but always
  // fully on screen (on a phone it shifts left). Its tail keeps pointing at the mascot.
  const bubble = (() => {
    if (!spot) return { left: 0, width: 320, tail: 24 };
    const width = Math.min(320, spot.room);
    const right = spot.left + spot.width;
    const left = Math.max(0, Math.min(right - width, spot.room - width));
    const mascotCentre = right - 0.55 * spot.em - 22; // the mascot button is 44px wide, 0.55em in from the end
    return { left, width, tail: Math.max(14, Math.min(width - 26, mascotCentre - left - 6)) };
  })();

  // Dragging the bubble by its title bar (mouse or finger). It can go anywhere on the screen, but never completely out of
  // it. Moves are followed on the window, so a quick drag that leaves the title bar is not lost.
  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-nodrag]")) return;
    const bubbleEl = e.currentTarget.parentElement;
    if (!bubbleEl) return;
    const d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y, rect: bubbleEl.getBoundingClientRect(), moved: false };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 5) return; // a click, not a drag
        d.moved = true;
        setDragging(true);
      }
      const margin = 8;
      const x = Math.min(Math.max(dx, margin - d.rect.left), window.innerWidth - margin - d.rect.right);
      const y = Math.min(Math.max(dy, margin - d.rect.top), window.innerHeight - 44 - d.rect.top);
      setPos({ x: d.bx + x, y: d.by + y });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      stop();
      if (d.moved) {
        setDragging(false);
        justDragged.current = true; // the click that follows a drag must not minimize the bubble
        window.setTimeout(() => (justDragged.current = false), 0);
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      endDrag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    endDrag.current = stop;
  };
  const away = Math.hypot(pos.x, pos.y) > 36; // moved off the mascot: the tail pointing at it would mislead

  const btn =
    "rounded-full border border-g300 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors duration-200 hover:border-ink max-lg:py-2.5";
  const iconBtn = "grid size-7 place-items-center rounded-md text-g400 transition-colors hover:bg-g100 hover:text-ink max-lg:size-9";
  const lastReply = [...history].reverse().find((m) => m.role === "assistant");
  const lastQuestion = [...history].reverse().find((m) => m.role === "user");
  // the reply as far as the voice has got (all of it at once when the voice is off)
  const replyFull = lastReply ? withoutMarkers(lastReply.content) : "";
  const replyShown = voice && canSpeak ? replyFull.slice(0, reveal.n) : replyFull;
  // verses already read out (all of them when nothing is being read)
  let counted = 0;

  return (
    <div className="relative">
      <h1 className={className}>
        {first} <span ref={surnameRef}>{surname}</span>
      </h1>
      {spot && (
        <span
          className="pointer-events-none absolute block font-pixel text-[clamp(2.1rem,8vw,2.6rem)] leading-none"
          style={{ left: spot.left, top: spot.top, width: spot.width, height: "1em" }}
        >
          {/* the mascot, sitting on the letters; click it to talk */}
          <button
            type="button"
            onClick={() => (step === "hidden" ? greet() : close())}
            aria-label={step === "hidden" ? "Say hi to the mascot" : "Close the mascot's message"}
            aria-expanded={step !== "hidden"}
            className="mascot-pop pointer-events-auto absolute right-[0.55em] cursor-pointer rounded-md p-0.5 focus-visible:outline-offset-1"
            style={{ bottom: "calc(100% - 15px)" }}
          >
            <Mascot waving={waving} talking={reveal.talking && step !== "hidden"} />
          </button>

          {step !== "hidden" && (
            <span
              role="status"
              aria-live="polite"
              className="bubble-in pointer-events-auto absolute top-full z-30 mt-3 block rounded-2xl border border-g200 bg-bg text-left font-sans text-[13px] font-normal leading-[1.55] tracking-normal text-ink shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]"
              style={{
                left: bubble.left - spot.left,
                width: minimized ? Math.min(bubble.width, 184) : bubble.width,
                translate: pos.x || pos.y ? `${pos.x}px ${pos.y}px` : undefined,
              }}
            >
              {/* little tail pointing up at the mascot */}
              <span
                aria-hidden
                className={`absolute -top-[7px] size-3 rotate-45 border-l border-t border-g200 bg-bg ${away ? "hidden" : ""}`}
                style={{ left: minimized ? Math.max(14, Math.min(bubble.tail, 184 - 26)) : bubble.tail }}
              />

              {/* header: who is talking, the voice switch and close */}
              <span
                onPointerDown={startDrag}
                title="Drag to move"
                className={`flex touch-none select-none items-center justify-between gap-1 py-0.5 pl-1.5 pr-1 ${dragging ? "cursor-grabbing" : "cursor-grab"} ${minimized ? "" : "border-b border-g200"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!justDragged.current) setMinimized((m) => !m);
                  }}
                  aria-expanded={!minimized}
                  aria-label={minimized ? "Expand the mascot's message" : "Minimize the mascot's message"}
                  className="micro flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-g500 transition-colors hover:text-ink max-lg:py-2.5"
                >
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full transition-colors ${reveal.talking ? "animate-pulse bg-ink" : "bg-g300"}`}
                  />
                  {reveal.talking ? "Speaking" : "Mascot"}
                </button>
                <span className="flex items-center">
                  {canSpeak && !minimized && (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      aria-pressed={voice}
                      aria-label={voice ? "Mute the mascot" : "Let the mascot speak"}
                      title={voice ? "Voice on" : "Voice off"}
                      data-nodrag
                      className={iconBtn}
                    >
                      <Icon name={voice ? "volume" : "volumeOff"} className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMinimized((m) => !m)}
                    aria-label={minimized ? "Expand" : "Minimize"}
                    title={minimized ? "Expand" : "Minimize"}
                    data-nodrag
                    className={iconBtn}
                  >
                    {minimized ? "+" : "−"}
                  </button>
                  <button type="button" onClick={close} aria-label="Close" data-nodrag className={iconBtn}>
                    ×
                  </button>
                </span>
              </span>

              {/* the conversation: scrolls when it gets long, and follows the words as they are spoken */}
              <span
                ref={bodyRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                }}
                className={`${minimized ? "hidden" : "block"} max-h-[min(40vh,250px)] overflow-y-auto overscroll-contain px-3.5 py-2.5`}
              >
                {step !== "chat" && <span className="block">{shown}</span>}

                {step === "ask" && done && (
                  <span className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={btn} onClick={() => reply("okay")}>
                      I&apos;m okay 🙂
                    </button>
                    <button type="button" className={btn} onClick={() => reply("notOkay")}>
                      Not really
                    </button>
                  </span>
                )}

                {step === "verse" && done && verse && (
                  <>
                    <span className="mt-3 block rounded-xl border border-g200 bg-g50 p-3">
                      <span className="block font-serif text-[14px] italic leading-[1.6] text-g700">“{verse.text}”</span>
                      <span className="micro mt-2 block text-g500">{verse.ref} · KJV</span>
                    </span>
                    <span className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          const v = showVerse(answer, verse);
                          say(`${v.text} ${v.ref}.`);
                        }}
                      >
                        Another verse
                      </button>
                      <button type="button" className={btn} onClick={close}>
                        Thank you
                      </button>
                    </span>
                  </>
                )}

                {step === "chat" && (
                  <>
                    {lastQuestion && (
                      <span className="mb-3 ml-auto block w-fit max-w-[88%] break-words rounded-2xl rounded-br-md bg-g100 px-3 py-1.5 text-[12.5px] leading-[1.5] text-g700">
                        {lastQuestion.content}
                      </span>
                    )}
                    <span className="block whitespace-pre-wrap break-words">
                      {replyShown || (busy || replyFull ? <span className="text-g400">Thinking…</span> : null)}
                    </span>

                    {/* the verses, with the exact King James text, each one appearing as it is read */}
                    {cards.map((c, i) => {
                      const start = counted;
                      counted += "error" in c ? 1 : c.verses.length;
                      if (start >= units) return null;
                      return "error" in c ? (
                        <span key={i} className="mt-3 block text-[12px] text-g500">
                          {verseTrouble(c)}
                        </span>
                      ) : (
                        <span key={i} className="mt-3 block rounded-xl border border-g200 bg-g50 p-3">
                          <span className="micro mb-1.5 block text-g500">
                            {c.reference} · KJV{c.truncated ? " · first 40 verses" : ""}
                          </span>
                          <span className="block font-serif text-[14px] italic leading-[1.6] text-g700">
                            {c.verses.map((v, j) =>
                              start + j < units ? (
                                <span key={`${v.chapter}:${v.verse}`}>
                                  {c.verses.length > 1 && (
                                    <sup className="mr-0.5 font-sans text-[9px] not-italic text-g400">{v.verse}</sup>
                                  )}
                                  {v.text}{" "}
                                </span>
                              ) : null,
                            )}
                          </span>
                        </span>
                      );
                    })}
                  </>
                )}
              </span>

              {/* the visitor can write to the mascot once it has asked how they are */}
              {!minimized && (step === "verse" || step === "chat" || (step === "ask" && done)) && (
                <form
                  className="flex items-center gap-2 border-t border-g200 px-2.5 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={300}
                    placeholder="Talk to me, or ask for a verse…"
                    aria-label="Write to the mascot"
                    className="min-w-0 flex-1 rounded-lg border border-g200 bg-g50 px-2.5 py-2 text-[12px] outline-none transition-colors placeholder:text-g400 focus:border-g400 max-lg:py-2.5"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-bg transition-opacity disabled:opacity-30 max-lg:size-10"
                  >
                    <Icon name="arrow" className="size-3.5" />
                  </button>
                </form>
              )}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
