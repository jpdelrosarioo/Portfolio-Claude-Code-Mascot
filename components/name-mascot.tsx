"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mascot, site } from "@/data/site";
import { moderate, moderationMessage } from "@/lib/moderation";
import { isSpeaking, sentenceBoundary, speak, speechSupported, stopSpeaking, subscribeSpeaking } from "@/lib/speech";
import { Icon } from "./icons";

type Verse = { text: string; ref: string };
type Step = "hidden" | "greet" | "ask" | "verse" | "chat";
/** `local`: shown in the bubble but never sent to the AI (a blocked message and the mascot's reply to it). */
type Msg = { role: "user" | "assistant"; content: string; local?: boolean };

const SEEN = "mascot-greeted"; // the greeting opens by itself once per visit; afterwards the mascot is clicked to talk
const VOICE_KEY = "mascot-voice"; // the visitor's choice: the mascot speaks out loud, or not
const VOICE = { pitch: 1.35, rate: 1.05 }; // a little higher and brighter than the chat voice: a small, cheerful character
const noSubscribe = () => () => {};

/** Reveals text a few letters at a time, like someone typing. Shows it all at once with reduced motion. */
function useTyped(text: string, speed = 22) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!text) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

const pick = (list: Verse[], not?: Verse) => {
  const options = list.length > 1 && not ? list.filter((v) => v.ref !== not.ref) : list;
  return options[Math.floor(Math.random() * options.length)];
};

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
  const timer = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const voiceRef = useRef(true);

  const canSpeak = useSyncExternalStore(noSubscribe, speechSupported, () => false);
  const speaking = useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);

  // the visitor's voice choice is remembered
  useEffect(() => {
    try {
      const on = localStorage.getItem(VOICE_KEY) !== "off";
      setVoice(on);
      voiceRef.current = on;
    } catch {}
  }, []);

  /** Says something out loud in the mascot's voice (if the visitor has the voice on). */
  const say = useCallback((text: string, { queue = false } = {}) => {
    if (!voiceRef.current || !text) return;
    if (!queue) stopSpeaking();
    speak(text, VOICE);
  }, []);

  const lines: Record<Step, string> = {
    hidden: "",
    greet: mascot.greeting,
    ask: mascot.question,
    verse: answer === "okay" ? "Glad to hear it! Here's a verse for you:" : "I'm sorry it's been hard. You're not alone. Here's a verse for you:",
    chat: "",
  };
  const { shown, done } = useTyped(lines[step]);

  const greet = useCallback(() => {
    setWaving(true);
    window.setTimeout(() => setWaving(false), 2800);
    setStep("greet");
    say(mascot.greeting);
  }, [say]);

  const close = useCallback(() => {
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
      sessionStorage.setItem(SEEN, "1");
    } catch {}
    if (seen) return;
    timer.current = window.setTimeout(greet, 1400);
    return () => window.clearTimeout(timer.current);
  }, [greet]);

  // after the greeting has been typed, move on to the question
  useEffect(() => {
    if (step !== "greet" || !done) return;
    const id = window.setTimeout(() => {
      setStep("ask");
      say(mascot.question, { queue: true });
    }, 1400);
    return () => window.clearTimeout(id);
  }, [step, done, say]);

  // Escape closes the bubble; leaving the page stops the voice
  useEffect(() => {
    if (step === "hidden") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, close]);
  useEffect(() => () => {
    stopSpeaking();
    abort.current?.abort();
  }, []);

  const showVerse = (a: "okay" | "notOkay", previous?: Verse) => {
    const v = pick(a === "okay" ? mascot.okay : mascot.notOkay, previous);
    setVerse(v);
    return v;
  };

  const reply = (a: "okay" | "notOkay") => {
    setAnswer(a);
    const v = showVerse(a);
    setStep("verse");
    say(`${a === "okay" ? "Glad to hear it! Here's a verse for you." : "I'm sorry it's been hard. You're not alone. Here's a verse for you."} ${v.text} ${v.ref}.`);
  };

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    voiceRef.current = on;
    try {
      localStorage.setItem(VOICE_KEY, on ? "on" : "off");
    } catch {}
    if (!on) stopSpeaking();
  };

  // The visitor writes to the mascot: it reads the message and answers through the AI, in its own caring voice.
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setStep("chat");

    // the same filter as the chat: bad words, spam, harmful requests get a kind, instant answer and are never sent
    const why = moderate(text);
    if (why) {
      const msg = moderationMessage(why, site.name) ?? "Let's keep it kind. 🙂";
      // kept out of the conversation sent to the AI, so one blocked message doesn't get every later message blocked too
      setHistory((h): Msg[] =>
        [...h, { role: "user" as const, content: text, local: true }, { role: "assistant" as const, content: msg, local: true }].slice(-8),
      );
      say(msg);
      return;
    }

    const next: Msg[] = [...history, { role: "user" as const, content: text }].slice(-8);
    setHistory([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    stopSpeaking();
    const controller = new AbortController();
    abort.current = controller;
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
        // speak each sentence as soon as it is complete
        const cut = sentenceBoundary(answerText, spoken);
        if (cut > spoken) {
          say(answerText.slice(spoken, cut), { queue: true });
          spoken = cut;
        }
      }
      if (spoken < answerText.length) say(answerText.slice(spoken), { queue: true });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const msg = (e as Error).message || TROUBLE.upstream;
        update(msg);
        say(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!mascot.enabled || !surname) return <h1 className={className}>{name}</h1>;

  // Where the speech bubble goes: under the name, lined up with the end of the surname when there is room, but always
  // fully on screen (on a phone it shifts left). Its tail keeps pointing at the mascot.
  const bubble = (() => {
    if (!spot) return { left: 0, width: 288, tail: 24 };
    const width = Math.min(288, spot.room);
    const right = spot.left + spot.width;
    const left = Math.max(0, Math.min(right - width, spot.room - width));
    const mascotCentre = right - 0.55 * spot.em - 22; // the mascot button is 44px wide, 0.55em in from the end
    return { left, width, tail: Math.max(14, Math.min(width - 26, mascotCentre - left - 6)) };
  })();

  const btn =
    "rounded-full border border-g300 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors duration-200 hover:border-ink max-lg:py-2.5";
  const iconBtn = "grid size-7 place-items-center rounded-md text-g400 transition-colors hover:bg-g100 hover:text-ink max-lg:size-9";
  const lastReply = [...history].reverse().find((m) => m.role === "assistant");
  const lastQuestion = [...history].reverse().find((m) => m.role === "user");

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
            <Mascot waving={waving} talking={speaking && step !== "hidden"} />
          </button>

          {step !== "hidden" && (
            <span
              role="status"
              aria-live="polite"
              className="bubble-in pointer-events-auto absolute top-full z-30 mt-3 block rounded-2xl border border-g200 bg-bg p-4 text-left font-sans text-[13px] font-normal leading-[1.55] tracking-normal text-ink shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]"
              style={{ left: bubble.left - spot.left, width: bubble.width }}
            >
              {/* little tail pointing up at the mascot */}
              <span
                aria-hidden
                className="absolute -top-[7px] size-3 rotate-45 border-l border-t border-g200 bg-bg"
                style={{ left: bubble.tail }}
              />
              <span className="absolute right-2 top-2 flex items-center">
                {canSpeak && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-pressed={voice}
                    aria-label={voice ? "Mute the mascot" : "Let the mascot speak"}
                    title={voice ? "Voice on" : "Voice off"}
                    className={iconBtn}
                  >
                    <Icon name={voice ? "volume" : "volumeOff"} className="size-3.5" />
                  </button>
                )}
                <button type="button" onClick={close} aria-label="Close" className={iconBtn}>
                  ×
                </button>
              </span>

              {step !== "chat" && <span className="block pr-14">{shown}</span>}

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
                  <span className="mt-3 block border-l-2 border-g300 pl-3 font-serif text-[14px] italic leading-[1.6] text-g700">
                    “{verse.text}”
                  </span>
                  <span className="micro mt-2 block pl-3 text-g500">{verse.ref} (KJV)</span>
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
                <span className="block pr-14">
                  {lastQuestion && <span className="mb-2 block text-[12px] text-g500">You: {lastQuestion.content}</span>}
                  <span className="block whitespace-pre-wrap">
                    {lastReply?.content || (busy ? <span className="text-g400">Thinking…</span> : null)}
                  </span>
                </span>
              )}

              {/* the visitor can write to the mascot once it has asked how they are */}
              {(step === "verse" || step === "chat" || (step === "ask" && done)) && (
                <form
                  className="mt-3 flex items-center gap-2 border-t border-g200 pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={300}
                    placeholder="Tell me how you're doing…"
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
